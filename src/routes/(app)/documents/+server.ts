import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { count, eq } from "drizzle-orm";
import { error } from "@sveltejs/kit";
import type {
  DocumentIngestEvent,
  DocumentIngestProgress,
  DocumentIngestResult,
} from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { document_chunks, documents, synced_files } from "$lib/server/database/schema";
import { containsPath } from "$lib/server/documents/remove-document";
import { ingestDocument } from "$lib/server/rag/ingest-document";
import type { RequestHandler } from "./$types";

const DOCUMENTS_DIR = "documents";

type UploadKind = "pdf" | "docx" | "pptx" | "csv" | "xlsx" | "txt" | "md";

function isZip(buffer: Buffer): boolean {
  // DOCX/PPTX/XLSX are ZIP archives (OOXML); their first bytes are "PK\x03\x04"
  return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

function detectKind(name: string, buffer: Buffer): UploadKind | null {
  const lower = name.toLowerCase();

  if (lower.endsWith(".pdf")) {
    return buffer.subarray(0, 5).toString() === "%PDF-" ? "pdf" : null;
  }
  if (lower.endsWith(".docx")) {
    return isZip(buffer) ? "docx" : null;
  }
  if (lower.endsWith(".pptx")) {
    return isZip(buffer) ? "pptx" : null;
  }
  if (lower.endsWith(".xlsx")) {
    return isZip(buffer) ? "xlsx" : null;
  }
  // CSV/TXT/MD are plain text with no magic-byte signature to check - trust the extension.
  if (lower.endsWith(".csv")) {
    return "csv";
  }
  if (lower.endsWith(".txt")) {
    return "txt";
  }
  if (lower.endsWith(".md")) {
    return "md";
  }

  return null;
}

async function ingestBuffer(
  originalName: string,
  buffer: Buffer,
  onProgress: (progress: DocumentIngestProgress) => void,
): Promise<DocumentIngestResult> {
  const kind = detectKind(originalName, buffer);
  if (!kind) {
    throw new Error("Only PDF, DOCX, PPTX, CSV, XLSX, TXT, and MD uploads are supported.");
  }

  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const savedPath = join(DOCUMENTS_DIR, `${contentHash.slice(0, 16)}.${kind}`);
  const [existing] = await db
    .select({
      documentId: documents.id,
      title: documents.title,
      sourcePath: documents.sourcePath,
      chunkCount: count(document_chunks.id),
    })
    .from(documents)
    .leftJoin(document_chunks, eq(document_chunks.documentId, documents.id))
    .where(eq(documents.sourcePath, savedPath))
    .groupBy(documents.id)
    .limit(1);

  if (existing) {
    return { ...existing, pageCount: 0, chunkCount: Number(existing.chunkCount ?? 0) };
  }

  await writeFile(savedPath, buffer);

  const result = await ingestDocument(
    {
      filePath: savedPath,
      title: originalName.replace(/\.(pdf|docx|pptx|csv|xlsx|txt|md)$/i, "").trim() || originalName,
    },
    onProgress,
  );

  return result;
}

async function ingestUpload(
  request: Request,
  onProgress: (progress: DocumentIngestProgress) => void,
): Promise<DocumentIngestResult> {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("No file included in upload.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return ingestBuffer(file.name, buffer, onProgress);
}

async function ingestPath(
  filePath: string,
  onProgress: (progress: DocumentIngestProgress) => void,
): Promise<DocumentIngestResult> {
  const root = await realpath(homedir());
  const path = await realpath(resolve(filePath));
  const fileStats = await stat(path);

  if (!containsPath(root, path) || !fileStats.isFile()) {
    throw new Error("Select a PDF, DOCX, PPTX, CSV, XLSX, TXT, or MD file inside your home folder.");
  }

  const [tracked] = await db
    .select({
      documentId: documents.id,
      title: documents.title,
      sourcePath: documents.sourcePath,
      chunkCount: count(document_chunks.id),
    })
    .from(synced_files)
    .innerJoin(documents, eq(documents.id, synced_files.documentId))
    .leftJoin(document_chunks, eq(document_chunks.documentId, documents.id))
    .where(eq(synced_files.sourcePath, path))
    .groupBy(documents.id)
    .limit(1);

  if (tracked) {
    return { ...tracked, pageCount: 0, chunkCount: Number(tracked.chunkCount ?? 0) };
  }

  return ingestBuffer(basename(path), await readFile(path), onProgress);
}

export const POST: RequestHandler = async ({ request }) => {
  // A document arrives either as a server filesystem path (folder-browser flow) or raw
  // bytes (pasted file) - the Clipboard API only ever gives JS bytes, never a path.
  const isUpload = (request.headers.get("content-type") ?? "").includes("multipart/form-data");

  let selectedPath: string | null = null;
  if (!isUpload) {
    const { paths } = (await request.json()) as { paths?: unknown };
    const selectedPaths = Array.isArray(paths)
      ? paths.filter((path): path is string => typeof path === "string")
      : [];

    if (selectedPaths.length !== 1) {
      throw error(400, "Upload one PDF, DOCX, PPTX, CSV, XLSX, TXT, or MD file per request.");
    }
    selectedPath = selectedPaths[0];
  }

  await mkdir(DOCUMENTS_DIR, { recursive: true });
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: DocumentIngestEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      const run = isUpload
        ? ingestUpload(request, (progress) => send({ status: "progress", ...progress }))
        : ingestPath(selectedPath as string, (progress) => send({ status: "progress", ...progress }));

      void run
        .then((result) => send({ status: "complete", result }))
        .catch((cause) => {
          send({
            status: "error",
            message: cause instanceof Error ? cause.message : "Document ingestion failed",
          });
        })
        .finally(() => controller.close());
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
};
