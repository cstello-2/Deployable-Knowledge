import { basename } from "node:path";
import { TextExtract } from "$lib/server/rag/chunk/text-extract";
import { chunkPages } from "$lib/server/rag/chunk/chunker-semantic";
import { assembleChunks } from "$lib/server/rag/chunk/assemble-chunks";
import type { Source } from "$lib/server/rag/chunk/parse-shared";
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
  chunkCount: number;
};

// Shared ingest path for both terminal commands (testing) and UI routes
export async function ingestDocument({
  filePath,
  title,
}: IngestDocumentInput): Promise<IngestDocumentResult> {
  // Keep source info together so every downstream chunk can carry the same document identity
  const source: Source = {
    title: title?.trim() || basename(filePath),
    type: "PDF", // NOTE: PDF support for now, .docx later
    path: filePath,
  };

  // Updated linear ingest path: extract pages/tables, chunk text, assemble final chunks, then store
  const pages = await TextExtract(source);
  const rawChunks = await chunkPages(pages);
  const chunks = assembleChunks(pages, rawChunks);
  const stored = await storeDocumentChunks(chunks);

  return {
    documentId: stored.documentId,
    title: source.title,
    sourcePath: source.path,
    pageCount: pages.length,
    chunkCount: stored.chunkCount,
  };
}
