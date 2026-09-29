import { mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import type { Llama, LlamaChat, LlamaContext, LlamaModel, ModelDownloader } from 'node-llama-cpp';

import type { DownloadableModel, LocalModel } from '$lib/constants/local-models';
import type { LlamaGpuMode } from '$lib/types';

export type SupportedGpuType = Exclude<LlamaGpuMode, 'auto' | 'cpu'>;

const MODELS_DIR = resolve(process.cwd(), 'models');

const MODEL_FILE_PATTERN = /^[\w][\w.-]*\.gguf$/i;

type LlamaModuleState = {
	nlc?: Promise<typeof import('node-llama-cpp')>;
	llamaInstance?: { gpu: LlamaGpuMode; promise: Promise<Llama> };
	gpuTypes?: Promise<SupportedGpuType[]>;
	runtime: Runtime | null;
	opQueue: Promise<unknown>;
	activeDownload: { fileName: string; downloader: ModelDownloader | null } | null;
};

const state = ((
	globalThis as typeof globalThis & { deployableKnowledgeLlamaState?: LlamaModuleState }
).deployableKnowledgeLlamaState ??= {
	runtime: null,
	opQueue: Promise.resolve(),
	activeDownload: null
});

const loadNlc = () => (state.nlc ??= import('node-llama-cpp'));

async function createLlama(gpu: LlamaGpuMode): Promise<Llama> {
	const mod = await loadNlc();
	if (gpu === 'auto') return mod.getLlama();
	if (gpu === 'cpu') return mod.getLlama({ gpu: false });
	try {
		return await mod.getLlama({ gpu });
	} catch (error) {
		console.warn(`[llamacpp] Failed to initialize ${gpu} backend, falling back to CPU:`, error);
		return mod.getLlama({ gpu: false });
	}
}

async function getLlamaFor(gpu: LlamaGpuMode): Promise<Llama> {
	if (state.llamaInstance?.gpu === gpu) return state.llamaInstance.promise;

	const previous = state.llamaInstance;
	state.llamaInstance = undefined;
	if (previous) {
		await previous.promise.then((llama) => llama.dispose()).catch(() => undefined);
	}

	const entry = { gpu, promise: createLlama(gpu) };
	entry.promise.catch(() => {
		if (state.llamaInstance === entry) state.llamaInstance = undefined;
	});
	state.llamaInstance = entry;
	return entry.promise;
}

export function getSupportedGpuTypes(): Promise<SupportedGpuType[]> {
	return (state.gpuTypes ??= loadNlc()
		.then((mod) => mod.getLlamaGpuTypes('supported'))
		.then((types) =>
			types.filter((type): type is SupportedGpuType => type === 'cuda' || type === 'vulkan')
		)
		.catch(() => []));
}

export async function listLocalModelFiles(): Promise<string[]> {
	if (!existsSync(MODELS_DIR)) return [];

	const entries = await readdir(MODELS_DIR, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isFile() && MODEL_FILE_PATTERN.test(entry.name))
		.map((entry) => entry.name)
		.sort();
}

export function resolveLocalModelPath(fileName: string): string {
	if (!MODEL_FILE_PATTERN.test(fileName)) throw new Error(`Invalid model file name: ${fileName}`);
	return join(MODELS_DIR, fileName);
}

export const getActiveDownloadFile = (): string | null => state.activeDownload?.fileName ?? null;

export async function createGgufDownloader(
	model: Pick<DownloadableModel, 'repo' | 'fileName'>,
	dirPath: string,
	onProgress: (loaded: number, total: number) => void
): Promise<ModelDownloader> {
	await mkdir(dirPath, { recursive: true });

	const { createModelDownloader } = await loadNlc();
	return createModelDownloader({
		modelUri: `hf:${model.repo}/${model.fileName}`,
		dirPath,
		fileName: model.fileName,
		skipExisting: true,
		deleteTempFileOnCancel: false,
		onProgress: ({ totalSize, downloadedSize }) => onProgress(downloadedSize, totalSize)
	});
}

export async function downloadLocalModel(
	model: LocalModel,
	onProgress: (loaded: number, total: number) => void
): Promise<void> {
	if (state.activeDownload) {
		throw new Error(`A model download is already in progress (${state.activeDownload.fileName}).`);
	}

	state.activeDownload = { fileName: model.fileName, downloader: null };

	try {
		const downloader = await createGgufDownloader(model, MODELS_DIR, onProgress);
		state.activeDownload.downloader = downloader;
		await downloader.download();
	} finally {
		state.activeDownload = null;
	}
}

export function cancelActiveDownload(): void {
	void state.activeDownload?.downloader?.cancel({ deleteTempFile: false });
}

type Runtime = {
	model: LlamaModel;
	context: LlamaContext;
	chat: LlamaChat;
	modelPath: string;
	gpu: LlamaGpuMode;
};

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

async function getRuntime(modelPath: string, gpu: LlamaGpuMode): Promise<Runtime> {
	if (state.runtime?.modelPath === modelPath && state.runtime.gpu === gpu) {
		return state.runtime;
	}

	await disposeRuntimeUnlocked();

	const { LlamaChat } = await loadNlc();
	const llama = await getLlamaFor(gpu);
	const model = await llama.loadModel({ modelPath });
	const context = await model.createContext({ contextSize: 'auto' });
	console.info(
		`[llamacpp] ${basename(modelPath)}: context ${context.contextSize} tokens, train max ${model.trainContextSize}, backend ${llama.gpu || 'cpu'}`
	);
	const chat = new LlamaChat({
		contextSequence: context.getSequence(),
		autoDisposeSequence: false
	});

	state.runtime = { model, context, chat, modelPath, gpu };

	return state.runtime;
}

export function withChat<T>(
	modelPath: string,
	gpu: LlamaGpuMode,
	signal: AbortSignal | undefined,
	run: (chat: LlamaChat) => Promise<T>
): Promise<T> {
	return withLock(async () => {
		signal?.throwIfAborted();
		return run((await getRuntime(modelPath, gpu)).chat);
	});
}

export function deleteLocalModel(fileName: string): Promise<void> {
	const path = resolveLocalModelPath(fileName);

	return withLock(async () => {
		if (state.runtime?.modelPath === path) await disposeRuntimeUnlocked();
		if (existsSync(path)) await unlink(path);
	});
}
