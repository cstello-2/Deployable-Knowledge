import { mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import type {
	ChatHistoryItem,
	ChatModelFunctions,
	Llama,
	LlamaChat,
	LlamaContext,
	LlamaModel,
	ModelDownloader
} from 'node-llama-cpp';

import type { LocalModel } from '$lib/constants/local-models';

export const MODELS_DIR = resolve(process.cwd(), 'models');

const MODEL_FILE_PATTERN = /^[\w][\w.-]*\.gguf$/i;
// Ceiling only — node-llama-cpp still auto-sizes below this based on free
// memory and the model's train context. Notebook mode alone can feed ~20k
// tokens of reference material, so a low ceiling silently truncates context.
const CONTEXT_SIZE_MAX = 32768;

type LlamaModuleState = {
	nlc?: Promise<typeof import('node-llama-cpp')>;
	llamaInstance?: Promise<Llama>;
	runtime: Runtime | null;
	opQueue: Promise<unknown>;
	activeDownload: { fileName: string; downloader: ModelDownloader | null } | null;
};

// Dev hot reloads re-instantiate this module. Keeping the state on globalThis
// (same pattern as hooks.server.ts) makes a reloaded module reuse the already
// loaded model instead of leaking a full model copy per reload.
const state = ((
	globalThis as typeof globalThis & { deployableKnowledgeLlamaState?: LlamaModuleState }
).deployableKnowledgeLlamaState ??= {
	runtime: null,
	opQueue: Promise.resolve(),
	activeDownload: null
});

// The native binary must only load on demand (chat/download/hardware probe),
// never when the provider registry is merely listed.
const loadNlc = () => (state.nlc ??= import('node-llama-cpp'));

const getLlamaInstance = () => (state.llamaInstance ??= loadNlc().then((mod) => mod.getLlama()));

export async function listLocalModelFiles(): Promise<string[]> {
	if (!existsSync(MODELS_DIR)) return [];

	const entries = await readdir(MODELS_DIR, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isFile() && MODEL_FILE_PATTERN.test(entry.name))
		.map((entry) => entry.name)
		.sort();
}

export function resolveLocalModelPath(fileName: string): string {
	if (!MODEL_FILE_PATTERN.test(fileName) || basename(fileName) !== fileName) {
		throw new Error(`Invalid model file name: ${fileName}`);
	}

	const path = resolve(join(MODELS_DIR, fileName));

	if (!path.startsWith(MODELS_DIR)) throw new Error(`Invalid model file name: ${fileName}`);

	return path;
}

export const getActiveDownloadFile = (): string | null => state.activeDownload?.fileName ?? null;

export async function downloadLocalModel(
	model: LocalModel,
	onProgress: (loaded: number, total: number) => void
): Promise<string> {
	if (state.activeDownload) {
		throw new Error(`A model download is already in progress (${state.activeDownload.fileName}).`);
	}

	state.activeDownload = { fileName: model.fileName, downloader: null };

	try {
		await mkdir(MODELS_DIR, { recursive: true });

		const { createModelDownloader } = await loadNlc();
		const downloader = await createModelDownloader({
			modelUri: `hf:${model.repo}/${model.fileName}`,
			dirPath: MODELS_DIR,
			fileName: model.fileName,
			skipExisting: true,
			deleteTempFileOnCancel: false,
			onProgress: ({ totalSize, downloadedSize }) => onProgress(downloadedSize, totalSize)
		});

		state.activeDownload.downloader = downloader;
		await downloader.download();

		return model.fileName;
	} finally {
		state.activeDownload = null;
	}
}

export function cancelActiveDownload(): void {
	void state.activeDownload?.downloader?.cancel({ deleteTempFile: false });
}

type Runtime = {
	llama: Llama;
	model: LlamaModel;
	context: LlamaContext;
	chat: LlamaChat;
	modelPath: string;
};

// All model operations share one context sequence, so they must never overlap.
function withLock<T>(fn: () => Promise<T>): Promise<T> {
	const run = state.opQueue.then(fn, fn);
	state.opQueue = run.catch(() => undefined);
	return run;
}

async function disposeRuntimeUnlocked(): Promise<void> {
	if (!state.runtime) return;

	const { model, context } = state.runtime;
	state.runtime = null;

	await context.dispose();
	await model.dispose();
}

async function getRuntime(modelPath: string): Promise<Runtime> {
	if (state.runtime?.modelPath === modelPath) return state.runtime;

	await disposeRuntimeUnlocked();

	const { LlamaChat } = await loadNlc();
	const llama = await getLlamaInstance();
	const model = await llama.loadModel({ modelPath });
	const context = await model.createContext({ contextSize: { max: CONTEXT_SIZE_MAX } });
	const chat = new LlamaChat({
		contextSequence: context.getSequence(),
		autoDisposeSequence: false
	});

	state.runtime = { llama, model, context, chat, modelPath };

	return state.runtime;
}

export interface LocalFunctionCall {
	functionName: string;
	params: unknown;
}

function resolveThoughtTokens(reasoningBudget: number | undefined): number | undefined {
	if (reasoningBudget === undefined) return undefined;
	if (reasoningBudget < 0) return Infinity;
	return reasoningBudget;
}

export function generateChatResponse(params: {
	modelPath: string;
	history: ChatHistoryItem[];
	functions?: ChatModelFunctions;
	temperature?: number;
	topK?: number;
	maxTokens?: number;
	reasoningBudget?: number;
	signal?: AbortSignal;
	onText: (text: string) => void;
	onReasoning: (text: string) => void;
}): Promise<{ functionCalls: LocalFunctionCall[] }> {
	return withLock(async () => {
		params.signal?.throwIfAborted();
		const { chat } = await getRuntime(params.modelPath);

		const thoughtTokens = resolveThoughtTokens(params.reasoningBudget);
		// generateResponse counts thought tokens against maxTokens, so a thinking
		// model can burn the whole response budget mid-thought and end the turn
		// with no visible answer. Mirror llama.cpp's --reasoning-budget semantics
		// instead: thinking gets its own headroom on top of the response budget.
		const maxTokens =
			params.maxTokens !== undefined && thoughtTokens !== undefined && thoughtTokens !== Infinity
				? params.maxTokens + thoughtTokens
				: params.maxTokens;

		const result = await chat.generateResponse(params.history, {
			...(params.functions ? { functions: params.functions, documentFunctionParams: true } : {}),
			...(thoughtTokens === undefined ? {} : { budgets: { thoughtTokens } }),
			temperature: params.temperature,
			topK: params.topK,
			maxTokens,
			signal: params.signal,
			onResponseChunk(chunk) {
				if (chunk.type === 'segment') {
					// Thought and comment segments both belong in the reasoning
					// trace; dropping segment text makes the model look stuck.
					if (chunk.text) params.onReasoning(chunk.text);
				} else if (chunk.type == null && chunk.text) {
					params.onText(chunk.text);
				}
			}
		});

		return {
			functionCalls: (result.functionCalls ?? []).map((call) => ({
				functionName: call.functionName,
				params: call.params
			}))
		};
	});
}

export function disposeRuntime(): Promise<void> {
	return withLock(disposeRuntimeUnlocked);
}

export function deleteLocalModel(fileName: string): Promise<void> {
	const path = resolveLocalModelPath(fileName);

	return withLock(async () => {
		if (state.runtime?.modelPath === path) await disposeRuntimeUnlocked();
		if (existsSync(path)) await unlink(path);
	});
}
