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

// The native binary must only load on demand (chat/download/hardware probe),
// never when the provider registry is merely listed.
let nlc: Promise<typeof import('node-llama-cpp')> | undefined;

const loadNlc = () => (nlc ??= import('node-llama-cpp'));

let llamaInstance: Promise<Llama> | undefined;

const getLlamaInstance = () => (llamaInstance ??= loadNlc().then((mod) => mod.getLlama()));

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

let activeDownload: { fileName: string; downloader: ModelDownloader | null } | null = null;

export const getActiveDownloadFile = (): string | null => activeDownload?.fileName ?? null;

export async function downloadLocalModel(
	model: LocalModel,
	onProgress: (loaded: number, total: number) => void
): Promise<string> {
	if (activeDownload) {
		throw new Error(`A model download is already in progress (${activeDownload.fileName}).`);
	}

	activeDownload = { fileName: model.fileName, downloader: null };

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

		activeDownload.downloader = downloader;
		await downloader.download();

		return model.fileName;
	} finally {
		activeDownload = null;
	}
}

export function cancelActiveDownload(): void {
	void activeDownload?.downloader?.cancel({ deleteTempFile: false });
}

type Runtime = {
	llama: Llama;
	model: LlamaModel;
	context: LlamaContext;
	chat: LlamaChat;
	modelPath: string;
};

let runtime: Runtime | null = null;
let opQueue: Promise<unknown> = Promise.resolve();

// All model operations share one context sequence, so they must never overlap.
function withLock<T>(fn: () => Promise<T>): Promise<T> {
	const run = opQueue.then(fn, fn);
	opQueue = run.catch(() => undefined);
	return run;
}

async function disposeRuntimeUnlocked(): Promise<void> {
	if (!runtime) return;

	const { model, context } = runtime;
	runtime = null;

	await context.dispose();
	await model.dispose();
}

async function getRuntime(modelPath: string): Promise<Runtime> {
	if (runtime?.modelPath === modelPath) return runtime;

	await disposeRuntimeUnlocked();

	const { LlamaChat } = await loadNlc();
	const llama = await getLlamaInstance();
	const model = await llama.loadModel({ modelPath });
	const context = await model.createContext({ contextSize: { max: CONTEXT_SIZE_MAX } });
	const chat = new LlamaChat({
		contextSequence: context.getSequence(),
		autoDisposeSequence: false
	});

	runtime = { llama, model, context, chat, modelPath };

	return runtime;
}

export interface LocalFunctionCall {
	functionName: string;
	params: unknown;
}

export function generateChatResponse(params: {
	modelPath: string;
	history: ChatHistoryItem[];
	functions?: ChatModelFunctions;
	temperature?: number;
	topK?: number;
	maxTokens?: number;
	reasoningBudget?: number;
	onText: (text: string) => void;
	onReasoning: (text: string) => void;
}): Promise<{ functionCalls: LocalFunctionCall[] }> {
	return withLock(async () => {
		const { chat } = await getRuntime(params.modelPath);

		const thoughtTokens =
			params.reasoningBudget === undefined
				? undefined
				: params.reasoningBudget < 0
					? Infinity
					: params.reasoningBudget;

		const result = await chat.generateResponse(params.history, {
			...(params.functions ? { functions: params.functions, documentFunctionParams: true } : {}),
			...(thoughtTokens === undefined ? {} : { budgets: { thoughtTokens } }),
			temperature: params.temperature,
			topK: params.topK,
			maxTokens: params.maxTokens,
			onResponseChunk(chunk) {
				if (chunk.type === 'segment' && chunk.segmentType === 'thought') {
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
		if (runtime?.modelPath === path) await disposeRuntimeUnlocked();
		if (existsSync(path)) await unlink(path);
	});
}
