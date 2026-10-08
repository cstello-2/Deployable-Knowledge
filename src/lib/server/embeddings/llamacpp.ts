import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Llama, LlamaEmbeddingContext, LlamaModel } from 'node-llama-cpp';
import {
	findLocalEmbeddingModel,
	LOCAL_MODEL_PROVIDER_ID,
	type EmbeddingDevice,
	type EmbeddingTask,
	type LocalEmbeddingModel
} from '$lib/constants';
import type { EmbeddingBackend } from '$lib/types';
import { diagnosticEvents } from '$lib/server/diagnostics/events';
import { createGgufDownloader } from '$lib/server/providers/llamacpp-runtime';
import { INFERENCE_THREADS } from '$lib/server/utils/inference-threads';
import { EmbeddingProvider, normalizeVector } from './provider';

// Kept apart from `models/`, which the chat provider lists as chat models.
const MODELS_DIR = resolve(process.cwd(), '.cache', 'embeddings');

type Runtime = {
	fileName: string;
	device: EmbeddingDevice;
	llama: Llama;
	model: LlamaModel;
	context: LlamaEmbeddingContext;
};

function catalogModel(fileName: string): LocalEmbeddingModel {
	const model = findLocalEmbeddingModel(fileName);
	if (!model) throw new Error(`Unknown local embedding model: ${fileName}`);
	return model;
}

export class LlamaCppEmbeddingProvider extends EmbeddingProvider {
	override id = LOCAL_MODEL_PROVIDER_ID;
	override name = 'Local (llama.cpp)';

	downloadingFile: string | null = null;
	private runtime: Runtime | null = null;
	private queue: Promise<unknown> = Promise.resolve();

	override async isInstalled(fileName: string): Promise<boolean> {
		return existsSync(join(MODELS_DIR, catalogModel(fileName).fileName));
	}

	override backend(): EmbeddingBackend | null {
		if (!this.runtime) return null;
		return this.runtime.llama.gpu || 'cpu';
	}

	override embed(
		texts: string[],
		task: EmbeddingTask,
		fileName: string,
		device: EmbeddingDevice
	): Promise<Float32Array[]> {
		return this.serialize(async () => {
			const { model, context } = await this.load(fileName, device);
			const prefix = catalogModel(fileName).prefixes[task];
			// The context adds a start and end token and rejects input that fills it.
			const maxTokens = model.trainContextSize - 3;
			const vectors: Float32Array[] = [];
			for (const text of texts) {
				const tokens = model.tokenize(prefix + text).slice(0, maxTokens);
				const { vector } = await context.getEmbeddingFor(tokens);
				vectors.push(normalizeVector(vector));
			}
			return vectors;
		});
	}

	override unload(): Promise<void> {
		return this.serialize(() => this.release());
	}

	async download(fileName: string, onProgress: (loaded: number, total: number) => void) {
		const model = catalogModel(fileName);
		if (this.downloadingFile) throw new Error('An embedding model download is already running.');

		this.downloadingFile = fileName;
		try {
			const downloader = await createGgufDownloader(model, MODELS_DIR, onProgress);
			await downloader.download();
		} finally {
			this.downloadingFile = null;
		}
	}

	remove(fileName: string): Promise<void> {
		const path = join(MODELS_DIR, catalogModel(fileName).fileName);
		return this.serialize(async () => {
			if (this.runtime?.fileName === fileName) await this.release();
			if (existsSync(path)) await unlink(path);
		});
	}

	// Loading, embedding, and unloading share native memory, so they run one at a time.
	private serialize<T>(run: () => Promise<T>): Promise<T> {
		const next = this.queue.then(run, run);
		this.queue = next.catch(() => undefined);
		return next;
	}

	private async load(fileName: string, device: EmbeddingDevice): Promise<Runtime> {
		if (this.runtime?.fileName === fileName && this.runtime.device === device) return this.runtime;
		await this.release();

		const started = Date.now();
		let runtime: Runtime;
		try {
			runtime = await this.createRuntime(fileName, device);
		} catch (error) {
			console.error(`[Embedding] ${fileName} failed to load:`, error);
			diagnosticEvents.embeddingFailed(error);
			throw error;
		}

		this.runtime = runtime;
		const backend = runtime.llama.gpu || 'cpu';
		const durationMs = Date.now() - started;
		console.log(`[Embedding] ${fileName} ready on ${backend} in ${durationMs}ms.`);
		diagnosticEvents.embeddingReady({ backend, durationMs, model: fileName });
		return runtime;
	}

	private async createRuntime(fileName: string, device: EmbeddingDevice): Promise<Runtime> {
		const { getLlama, LlamaLogLevel } = await import('node-llama-cpp');
		// Error level only: llama.cpp logs a warning for every embedding otherwise.
		const llama = await getLlama({
			gpu: device === 'cpu' ? false : 'auto',
			logLevel: LlamaLogLevel.error
		});

		try {
			if (device === 'gpu' && !llama.gpu) {
				throw new Error('No GPU (CUDA, Vulkan, or Metal) is available for embeddings.');
			}
			const model = await llama.loadModel({
				modelPath: join(MODELS_DIR, fileName),
				gpuLayers: device === 'gpu' ? 'max' : 'auto'
			});
			const context = await model.createEmbeddingContext({
				contextSize: model.trainContextSize,
				batchSize: model.trainContextSize,
				threads: INFERENCE_THREADS
			});
			return { fileName, device, llama, model, context };
		} catch (error) {
			await llama.dispose();
			throw error;
		}
	}

	private async release(): Promise<void> {
		const runtime = this.runtime;
		this.runtime = null;
		if (!runtime) return;

		await runtime.context.dispose();
		await runtime.model.dispose();
		await runtime.llama.dispose();
	}
}
