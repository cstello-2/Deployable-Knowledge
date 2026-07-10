import { resolve } from "node:path";
import { env, pipeline } from "@huggingface/transformers";

export const EMBEDDING_MODEL =
  process.env.SEMANTIC_EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2";
// TODO: Explore alternative embedding models at some point
const EMBEDDING_DTYPE = process.env.SEMANTIC_EMBED_DTYPE ?? "q8";
const EMBEDDING_BATCH_SIZE = Number(process.env.SEMANTIC_EMBED_BATCH_SIZE ?? "32");
const ALLOW_REMOTE_MODELS = process.env.SEMANTIC_EMBED_ALLOW_REMOTE === "1";
const EMBEDDING_CACHE_DIR =
  process.env.SEMANTIC_EMBED_CACHE_DIR ?? resolve(process.cwd(), ".cache", "transformersjs");

// Keep model files inside the repo by default so setup is portable across machines
env.cacheDir = EMBEDDING_CACHE_DIR;
env.localModelPath = EMBEDDING_CACHE_DIR;
// Remote downloads are opt-in; normal runs should use the configured local cache
env.allowRemoteModels = ALLOW_REMOTE_MODELS;

let embeddingPipelinePromise: Promise<any> | null = null;

// Load the transformer once and reuse it across ingest/search calls
async function getEmbeddingPipeline() {
  if (!embeddingPipelinePromise) {
    // Clear the cached promise on failure so a transient/missing-cache error doesn't
    // permanently wedge the pipeline for the rest of the process's lifetime.
    embeddingPipelinePromise = pipeline("feature-extraction", EMBEDDING_MODEL, {
      dtype: EMBEDDING_DTYPE as "q8" | "q4" | "fp32" | "fp16",
    }).catch((err) => {
      embeddingPipelinePromise = null;
      throw err;
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
