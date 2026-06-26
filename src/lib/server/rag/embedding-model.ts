// Shared embedding model helper used to create the chunks and embed the final chunks

import { env, pipeline } from "@huggingface/transformers";

export const EMBEDDING_MODEL =
  process.env.SEMANTIC_EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DTYPE = process.env.SEMANTIC_EMBED_DTYPE ?? "q8";
const EMBEDDING_BATCH_SIZE = Number(process.env.SEMANTIC_EMBED_BATCH_SIZE ?? "32");
const ALLOW_REMOTE_MODELS = process.env.SEMANTIC_EMBED_ALLOW_REMOTE === "1";

env.cacheDir = "./tmp_model/transformersjs";
env.allowRemoteModels = ALLOW_REMOTE_MODELS;

let embeddingPipelinePromise: Promise<any> | null = null;

// Load the local JS embedding model once for use in both cases
async function getEmbeddingPipeline() {
  if (!embeddingPipelinePromise) {
    embeddingPipelinePromise = pipeline("feature-extraction", EMBEDDING_MODEL, {
      dtype: EMBEDDING_DTYPE as "q8" | "q4" | "fp32" | "fp16",
    });}

  return embeddingPipelinePromise;}

// Batch text embeddings so both chunking and storage use the same exact model path
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor: any = await getEmbeddingPipeline();
  const embeddings: number[][] = [];

  for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(index, index + EMBEDDING_BATCH_SIZE);
    const output = await extractor(batch, {
      pooling: "mean",
      normalize: true,
    });

    embeddings.push(...(output.tolist() as number[][]));}

  return embeddings;}
