import { resolve } from "node:path";
import {
  env,
  ModelRegistry,
  pipeline,
  type ProgressCallback,
} from "@huggingface/transformers";

export const EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";
export const EMBEDDING_DTYPE = "q8";

const EMBEDDING_BATCH_SIZE = 16;
const EMBEDDING_CACHE_DIR = resolve(process.cwd(), ".cache", "transformersjs");

type EmbeddingType = "search_document" | "search_query";

// Keep model files inside the repo so setup works the same across machines
env.cacheDir = EMBEDDING_CACHE_DIR;
env.localModelPath = EMBEDDING_CACHE_DIR;
env.allowRemoteModels = true;

let embeddingPipeline: Promise<any> | undefined;

export function isEmbeddingModelInstalled() {
  return ModelRegistry.is_pipeline_cached(
    "feature-extraction",
    EMBEDDING_MODEL,
    {
      cache_dir: EMBEDDING_CACHE_DIR,
      dtype: EMBEDDING_DTYPE,
    },
  );
}

export function installEmbeddingModel(onProgress: ProgressCallback) {
  return getEmbeddingPipeline(onProgress);
}

// Load the transformer once and reuse it across ingest/search calls
async function getEmbeddingPipeline(onProgress?: ProgressCallback) {
  embeddingPipeline ??= pipeline("feature-extraction", EMBEDDING_MODEL, {
    dtype: EMBEDDING_DTYPE,
    cache_dir: EMBEDDING_CACHE_DIR,
    progress_callback: onProgress,
  });

  return embeddingPipeline;
}

export async function embedTexts(
  texts: string[],
  type: EmbeddingType,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor: any = await getEmbeddingPipeline();
  const embeddings: number[][] = [];

  for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = texts
      .slice(index, index + EMBEDDING_BATCH_SIZE)
      .map((text) => `${type}: ${text}`);
    const output = await extractor(batch, { pooling: "mean", normalize: true });
    embeddings.push(...(output.tolist() as number[][]));
  }

  return embeddings;
}
