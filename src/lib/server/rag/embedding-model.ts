import { resolve } from "node:path";
import {
  env,
  ModelRegistry,
  pipeline,
  type ProgressCallback,
} from "@huggingface/transformers";

export const EMBEDDING_MODEL = process.env.SEMANTIC_EMBED_MODEL ?? "nomic-ai/nomic-embed-text-v1.5";
export const EMBEDDING_DTYPE = process.env.SEMANTIC_EMBED_DTYPE ?? "q8";

const EMBEDDING_BATCH_SIZE = Number(process.env.SEMANTIC_EMBED_BATCH_SIZE ?? "16");
const ALLOW_REMOTE_MODELS = process.env.SEMANTIC_EMBED_ALLOW_REMOTE === "1";
const EMBEDDING_CACHE_DIR = process.env.SEMANTIC_EMBED_CACHE_DIR ?? resolve(process.cwd(), ".cache", "transformersjs");

type EmbeddingType = "search_document" | "search_query";

// Keep model files inside the repo so setup works the same across machines
env.cacheDir = EMBEDDING_CACHE_DIR;
env.localModelPath = EMBEDDING_CACHE_DIR;
env.allowRemoteModels = ALLOW_REMOTE_MODELS;

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

// Load the transformer once and reuse it across ingest/search calls 
async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    // Clear the cached promise on failure so a transient/missing-cache error doesn't
    // permanently wedge the pipeline for the rest of the process's lifetime.
    embeddingPipeline = pipeline("feature-extraction", EMBEDDING_MODEL, {
      dtype: EMBEDDING_DTYPE as "q8" | "q4" | "fp32" | "fp16",
    }).catch((err) => {
      embeddingPipeline = undefined;
      throw err;
    });
  }

  return embeddingPipeline;
}
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
  onProgress?: (current: number, total: number) => void,
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

    onProgress?.(
      Math.min(index + EMBEDDING_BATCH_SIZE, texts.length),
      texts.length,
    );
  }

  return embeddings;
}
