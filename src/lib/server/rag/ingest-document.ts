import { basename } from "node:path";
import { performance } from "node:perf_hooks";
import {
  TextExtract,
  type Source,
} from "$lib/server/rag/parse/text-extract";
import { chunkPages } from "$lib/server/rag/parse/chunker-semantic";
import { postprocessChunks } from "$lib/server/rag/parse/chunk-postprocess";
import { storeDocumentChunks } from "./embedding";

export type IngestDocumentInput = {
  filePath: string;
  title?: string;
};

export type IngestDocumentResult = {
  documentId: string;
  title: string;
  sourcePath: string;
  pageCount: number;
  rawChunkCount: number;
  chunkCount: number;
  embeddingModel: string;
  timings: {
    extractMs: number;
    chunkMs: number;
    postprocessMs: number;
    storeMs: number;
    totalMs: number;
  };
};

// Shared ingest path for both terminal harnesses and UI routes.
export async function ingestDocument({
  filePath,
  title,
}: IngestDocumentInput): Promise<IngestDocumentResult> {
  const totalStart = performance.now();
  const source: Source = {
    title: title?.trim() || basename(filePath),
    type: "PDF",
    path: filePath,
  };

  const extractStart = performance.now();
  const pages = await TextExtract(source);
  const extractMs = Number((performance.now() - extractStart).toFixed(3));

  const chunkStart = performance.now();
  const rawChunks = await chunkPages(pages);
  const chunkMs = Number((performance.now() - chunkStart).toFixed(3));

  const postprocessStart = performance.now();
  const chunks = postprocessChunks(pages, rawChunks);
  const postprocessMs = Number((performance.now() - postprocessStart).toFixed(3));

  const storeStart = performance.now();
  const stored = await storeDocumentChunks(chunks);
  const storeMs = Number((performance.now() - storeStart).toFixed(3));

  return {
    documentId: stored.documentId,
    title: source.title,
    sourcePath: source.path,
    pageCount: pages.length,
    rawChunkCount: rawChunks.length,
    chunkCount: stored.chunkCount,
    embeddingModel: stored.embeddingModel,
    timings: {
      extractMs,
      chunkMs,
      postprocessMs,
      storeMs,
      totalMs: Number((performance.now() - totalStart).toFixed(3)),
    },
  };
}
