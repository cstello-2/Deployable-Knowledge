import { resolve } from 'node:path';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import {
	env,
	ModelRegistry,
	pipeline,
	type FeatureExtractionPipeline,
	type ProgressCallback
} from '@huggingface/transformers';

export const EMBEDDING_MODEL = 'nomic-ai/nomic-embed-text-v1.5';
export const EMBEDDING_DTYPE = 'q8';

const EMBEDDING_BATCH_SIZE = 16;
const EMBEDDING_CACHE_DIR = resolve(process.cwd(), '.cache', 'transformersjs');

type EmbeddingType = 'search_document' | 'search_query';

// Keep model files inside the repo so setup works the same across machines
env.cacheDir = EMBEDDING_CACHE_DIR;
env.localModelPath = EMBEDDING_CACHE_DIR;
env.allowRemoteModels = true;

let embeddingPipeline: Promise<FeatureExtractionPipeline> | undefined;

export function isEmbeddingModelInstalled() {
	return ModelRegistry.is_pipeline_cached('feature-extraction', EMBEDDING_MODEL, {
		cache_dir: EMBEDDING_CACHE_DIR,
		dtype: EMBEDDING_DTYPE
	});
}

export function installEmbeddingModel(onProgress: ProgressCallback) {
	return getEmbeddingPipeline(onProgress);
}

// Load the transformer once and reuse it across ingest/search calls
async function getEmbeddingPipeline(onProgress?: ProgressCallback) {
	embeddingPipeline ??= pipeline('feature-extraction', EMBEDDING_MODEL, {
		dtype: EMBEDDING_DTYPE,
		cache_dir: EMBEDDING_CACHE_DIR,
		progress_callback: onProgress
	});

	return embeddingPipeline;
}

export async function embedTexts(
	texts: string[],
	type: EmbeddingType,
	onProgress?: (current: number, total: number) => void
): Promise<Float32Array[]> {
	if (texts.length === 0) return [];

	const extractor = await getEmbeddingPipeline();
	const embeddings: Float32Array[] = [];

	for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
		const batch = texts
			.slice(index, index + EMBEDDING_BATCH_SIZE)
			.map((text) => `${type}: ${text}`);

		const output = await extractor(batch, { pooling: 'mean', normalize: true });
		const values = output.data as Float32Array;
		const [rows, dims] = output.dims as [number, number];
		for (let row = 0; row < rows; row += 1) {
			embeddings.push(Float32Array.from(values.subarray(row * dims, (row + 1) * dims)));
		}
		output.dispose();

		onProgress?.(Math.min(index + EMBEDDING_BATCH_SIZE, texts.length), texts.length);
		await yieldEventLoop();
	}

	return embeddings;
}
