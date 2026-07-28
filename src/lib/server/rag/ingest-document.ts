import { rm } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { DocumentIngestProgress } from "$lib/requestTypes";
import { TextExtract } from "$lib/server/rag/chunk/text-extract";
import { convertDocxToPdf } from "$lib/server/rag/chunk/altFileChunking/docx-to-pdf";
import { PptxExtract } from "$lib/server/rag/chunk/altFileChunking/pptx-extract";
import { CsvExtract } from "$lib/server/rag/chunk/altFileChunking/csv-extract";
import { XlsxExtract } from "$lib/server/rag/chunk/altFileChunking/xlsx-extract";
import { TxtExtract } from "$lib/server/rag/chunk/altFileChunking/txt-extract";
import { MdExtract } from "$lib/server/rag/chunk/altFileChunking/md-extract";
import { chunkPages } from "$lib/server/rag/chunk/chunker";
import { assembleChunks } from "$lib/server/rag/chunk/assemble-chunks";
import type { Source } from "$lib/server/rag/chunk/parse-shared";
import type { TextExtractionResult } from "$lib/server/rag/chunk/text-extract";
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

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".docx", ".pptx", ".csv", ".xlsx", ".txt", ".md"]);

export function isSupportedDocument(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

const EXTRACTORS: Partial<
  Record<string, (source: Source, onPageProgress?: (current: number, total: number) => void) => Promise<TextExtractionResult>>
> = {
  ".pdf": TextExtract,
  ".pptx": PptxExtract,
  ".csv": CsvExtract,
  ".xlsx": XlsxExtract,
  ".txt": TxtExtract,
  ".md": MdExtract,
};

const SOURCE_TYPE_BY_EXTENSION: Partial<Record<string, Source["type"]>> = {
  ".pdf": "PDF",
  ".pptx": "PPTX",
  ".csv": "CSV",
  ".xlsx": "XLSX",
  ".txt": "TXT",
  ".md": "MD",
};

// Shared ingest path for both terminal commands (testing) and UI routes
export async function ingestDocument(
  { filePath, title }: IngestDocumentInput,
  onProgress?: (progress: DocumentIngestProgress) => void,
): Promise<IngestDocumentResult> {
  if (!isSupportedDocument(filePath)) throw new Error("Unsupported document type.");

  const report = (percent: number, message: string) => {
    onProgress?.({ percent, label: "Ingesting document", message });
  };

  // DOCX gets converted to a real PDF up front (pandoc + tectonic) purely so the existing
  // PDF extraction path can read it; it stays recorded as sourceType DOCX, not PDF. The
  // original .docx is only removed once the whole ingest succeeds, so a failure leaves it for cleanup.
  const originalExt = extname(filePath).toLowerCase();
  let resolvedPath = filePath;

  if (originalExt === ".docx") {
    report(0, "Converting DOCX to PDF");
    resolvedPath = filePath.replace(/\.docx$/i, ".pdf");
    await convertDocxToPdf(filePath, resolvedPath);
  }

  const ext = extname(resolvedPath).toLowerCase();
  const extract = EXTRACTORS[ext];
  const sourceType = originalExt === ".docx" ? "DOCX" : SOURCE_TYPE_BY_EXTENSION[ext];
  if (!extract || !sourceType) {
    throw new Error("Unsupported document type.");
  }

  // Keep source info together so every downstream chunk can carry the same document identity
  const source: Source = {
    title: title?.trim() || basename(filePath),
    type: sourceType,
    path: resolvedPath,
  };

  try {
    // Updated linear ingest path: extract pages/tables, chunk text, assemble final chunks, then store
    report(0, "Starting extraction");

    const extraction = await extract(source, (current, total) => {
      report((current / total) * 50, `Extracting ${current} of ${total}`);
    });

    const rawChunks = chunkPages(extraction.chunks);
    const chunks = assembleChunks(rawChunks);

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

    if (resolvedPath !== filePath) {
      await rm(filePath, { force: true });
    }

    return {
      documentId: stored.documentId,
      title: source.title,
      sourcePath: source.path,
      pageCount: extraction.pageCount,
      chunkCount: stored.chunkCount,
    };
  } catch (error) {
    if (resolvedPath !== filePath) {
      await rm(resolvedPath, { force: true });
    }
    throw error;
  }
}
