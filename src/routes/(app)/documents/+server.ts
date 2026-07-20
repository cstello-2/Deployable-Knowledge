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

function detectKind(name: string, buffer: Buffer): "pdf" | "docx" | null {
  const lower = name.toLowerCase();

  if (lower.endsWith(".pdf")) {
    const isPdf = buffer.subarray(0, 5).toString() === "%PDF-";
    return isPdf ? "pdf" : null;
  }

  if (lower.endsWith(".docx")) {
    // DOCX is a ZIP archive; its first bytes are "PK\x03\x04"
    const isZip =
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04;
    return isZip ? "docx" : null;
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
    throw new Error("Only PDF and DOCX uploads are supported.");
  }

  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const savedName = `${contentHash.slice(0, 16)}.${kind}`;
  const savedPath = join(DOCUMENTS_DIR, savedName);
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
      title: originalName.replace(/\.(pdf|docx)$/i, "").trim() || originalName,
    },
    onProgress,
  );

  return result;
}

async function ingestPath(
  filePath: string,
  onProgress: (progress: DocumentIngestProgress) => void,
): Promise<DocumentIngestResult> {
  const root = await realpath(homedir());
  const path = await realpath(resolve(filePath));
  const fileStats = await stat(path);

  if (!containsPath(root, path) || !fileStats.isFile()) {
    throw new Error("Select a PDF or DOCX file inside your home folder.");
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
  const { paths } = (await request.json()) as { paths?: unknown };
  const selectedPaths = Array.isArray(paths)
    ? paths.filter((path): path is string => typeof path === "string")
    : [];

  if (selectedPaths.length !== 1) {
    throw error(400, "Upload one PDF or DOCX file per request.");
  }

  await mkdir(DOCUMENTS_DIR, { recursive: true });
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: DocumentIngestEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void ingestPath(selectedPaths[0], (progress) => send({ status: "progress", ...progress }))
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
