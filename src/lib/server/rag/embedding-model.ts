import { resolve } from "node:path";
import {
  env,
  ModelRegistry,
  pipeline,
  type ProgressCallback,
} from "@huggingface/transformers";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DTYPE = "q8";

const EMBEDDING_BATCH_SIZE = 32;
const EMBEDDING_CACHE_DIR = resolve(process.cwd(), ".cache", "transformersjs");

// Keep model files inside the repo by default so setup is portable across machines
env.cacheDir = EMBEDDING_CACHE_DIR;
env.localModelPath = EMBEDDING_CACHE_DIR;
// Missing model files can be repaired from the Hub; cached launches stay local.
env.allowRemoteModels = true;

let embeddingPipelinePromise: Promise<any> | null = null;
const progressListeners = new Set<ProgressCallback>();

const reportProgress: ProgressCallback = (progress) => {
  for (const listener of progressListeners) listener(progress);
};

export async function isEmbeddingModelInstalled() {
  return ModelRegistry.is_pipeline_cached(
    "feature-extraction",
    EMBEDDING_MODEL,
    {
      cache_dir: EMBEDDING_CACHE_DIR,
      dtype: EMBEDDING_DTYPE,
    },
  );
}

export async function installEmbeddingModel(onProgress: ProgressCallback) {
  progressListeners.add(onProgress);

  try {
    await getEmbeddingPipeline();
  } finally {
    progressListeners.delete(onProgress);
  }
}

// Load the transformer once and reuse it across ingest/search calls
async function getEmbeddingPipeline() {
  if (!embeddingPipelinePromise) {
    // Clear the cached promise on failure so a transient/missing-cache error doesn't
    // permanently wedge the pipeline for the rest of the process's lifetime.
    embeddingPipelinePromise = pipeline("feature-extraction", EMBEDDING_MODEL, {
      dtype: EMBEDDING_DTYPE,
      cache_dir: EMBEDDING_CACHE_DIR,
      progress_callback: reportProgress,
    }).catch((error) => {
      embeddingPipelinePromise = null;
      throw error;
    });
  }

  return embeddingPipelinePromise;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor: any = await getEmbeddingPipeline();
  const embeddings: number[][] = [];

  // Batch calls keep ingest faster without changing the embedding contract
  for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(index, index + EMBEDDING_BATCH_SIZE);
    const output = await extractor(batch, {
      // Mean pooling + normalize gives one cosine ready vector per chunk/query
      // Allows semantic search to use dot product as the cosine score
      pooling: "mean",
      normalize: true,
    });

    embeddings.push(...(output.tolist() as number[][]));
  }

  return embeddings;
}
