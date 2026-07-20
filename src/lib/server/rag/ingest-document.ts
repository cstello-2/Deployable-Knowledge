import { basename, extname } from "node:path";
import type { DocumentIngestProgress } from "$lib/requestTypes";
import { TextExtract } from "$lib/server/rag/chunk/text-extract";
import { DocxExtract } from "$lib/server/rag/chunk/docx-extract";
import { chunkPages } from "$lib/server/rag/chunk/chunker";
import { assembleChunks } from "$lib/server/rag/chunk/assemble-chunks";
import type { Source } from "$lib/server/rag/chunk/parse-shared";
import { invalidateKnowledgeGraphCache } from "$lib/server/knowledge-graph/graph-index";
import { rebuildDocumentTriplets } from "$lib/server/knowledge-graph/triplet-store";

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

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".docx"]);

export function isSupportedDocument(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

// Shared ingest path for both terminal commands (testing) and UI routes
export async function ingestDocument(
  { filePath, title }: IngestDocumentInput,
  onProgress?: (progress: DocumentIngestProgress) => void,
): Promise<IngestDocumentResult> {
  if (!isSupportedDocument(filePath)) throw new Error("Unsupported document type.");

  const report = (percent: number, message: string) => {
    onProgress?.({ percent, label: "Ingesting document", message });
  };

  // Keep source info together so every downstream chunk can carry the same document identity
  const ext = extname(filePath).toLowerCase();
  const source: Source = {
    title: title?.trim() || basename(filePath),
    type: ext === ".docx" ? "DOCX" : "PDF",
    path: filePath,
  };

  // Updated linear ingest path: extract pages/tables, chunk text, assemble final chunks, then store
  report(0, "Starting extraction");

  const extraction = source.type === "DOCX"
    ? await DocxExtract(source)
    : await TextExtract(source, (current, total) => {
        report((current / total) * 50, `OCR page ${current} of ${total}`);
      });

  const rawChunks = chunkPages(extraction.chunks);
  const chunks = assembleChunks(extraction.chunks, rawChunks);

  report(50, `Embedding 0 of ${chunks.length} chunks`);

  const stored = await storeDocumentChunks(
    chunks,
    ({ stage, current, total }) => {
      if (stage !== "embedding") return;
      const ratio = total > 0 ? current / total : 1;
      report(50 + ratio * 50, `Embedding ${current} of ${total} chunks`);
    },
  );
  report(100, "Building Knowledge Graph triplets");
  await rebuildDocumentTriplets(stored.documentId, chunks);
  invalidateKnowledgeGraphCache();

  // Invalidate this document's cached graph so it picks up the new chunks
  invalidateKnowledgeGraphCache([stored.documentId]);

  return {
    documentId: stored.documentId,
    title: source.title,
    sourcePath: source.path,
    pageCount: extraction.pageCount,
    chunkCount: stored.chunkCount,
  };
}
