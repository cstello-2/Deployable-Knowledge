import { resolve } from "node:path";
import {
  env,
  ModelRegistry,
  pipeline,
  type ProgressCallback,
} from "@huggingface/transformers";

export const EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";
export const EMBEDDING_DTYPE = "q8";
export const EMBEDDING_DIMENSION = 768;
export const LEGACY_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const LEGACY_EMBEDDING_DIMENSION = 384;

const EMBEDDING_BATCH_SIZE = 16;
const LEGACY_EMBEDDING_BATCH_SIZE = 32;
const EMBEDDING_CACHE_DIR = resolve(process.cwd(), ".cache", "transformersjs");

export type EmbeddingType = "search_document" | "search_query";

// Keep model files inside the repo so setup works the same across machines
env.cacheDir = EMBEDDING_CACHE_DIR;
env.localModelPath = EMBEDDING_CACHE_DIR;
env.allowRemoteModels = true;

let embeddingPipeline: Promise<any> | undefined;
let legacyEmbeddingPipeline: Promise<any> | undefined;

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

async function getLegacyEmbeddingPipeline() {
  legacyEmbeddingPipeline ??= pipeline(
    "feature-extraction",
    LEGACY_EMBEDDING_MODEL,
    {
      dtype: EMBEDDING_DTYPE,
      cache_dir: EMBEDDING_CACHE_DIR,
    },
  );

  return legacyEmbeddingPipeline;
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

// Documents embedded before the Nomic upgrade retain 384-dimensional MiniLM
// vectors. Query them with the model that created them instead of mixing vector
// spaces or forcing users to reingest every existing document.
export async function embedTextsForStoredDimension(
  texts: string[],
  type: EmbeddingType,
  dimension: number,
): Promise<number[][]> {
  if (dimension === EMBEDDING_DIMENSION) {
    return embedTexts(texts, type);
  }
  if (dimension !== LEGACY_EMBEDDING_DIMENSION) {
    throw new Error(
      `Stored embeddings use unsupported dimension ${dimension}. ` +
        'Run "npm run embeddings:rebuild" before using Semantic or Hybrid search.',
    );
  }
  if (texts.length === 0) return [];

  const extractor: any = await getLegacyEmbeddingPipeline();
  const embeddings: number[][] = [];

  for (let index = 0; index < texts.length; index += LEGACY_EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(index, index + LEGACY_EMBEDDING_BATCH_SIZE);
    const output = await extractor(batch, { pooling: "mean", normalize: true });
    embeddings.push(...(output.tolist() as number[][]));
  }

  return embeddings;
}
