import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { count, desc, eq } from "drizzle-orm";
import { error, json } from "@sveltejs/kit";
import type {
  DocumentIngestEvent,
  DocumentIngestProgress,
  DocumentIngestResult,
} from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { document_chunks, documents, synced_files, type Document } from "$lib/server/database/schema";
import { containsPath } from "$lib/server/documents/remove-document";
import { ingestDocument } from "$lib/server/rag/ingest-document";
import type { RequestHandler } from "./$types";

const DOCUMENTS_DIR = "documents";

type DocumentListRow = Pick<Document, "id" | "title" | "sourcePath" | "sourceType" | "updatedAt"> & {
  chunkCount: number;
  folderId: string | null;
};

export const GET: RequestHandler = async () => {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      sourcePath: documents.sourcePath,
      sourceType: documents.sourceType,
      updatedAt: documents.updatedAt,
      chunkCount: count(document_chunks.id),
      folderId: synced_files.folderId,
    })
    .from(documents)
    .leftJoin(document_chunks, eq(document_chunks.documentId, documents.id))
    .leftJoin(synced_files, eq(synced_files.documentId, documents.id))
    .groupBy(documents.id)
    .orderBy(desc(documents.updatedAt));

  return json({
    documents: rows.map((row) => ({
      ...row,
      chunkCount: Number(row.chunkCount ?? 0),
      folderId: row.folderId ?? null,
    })) satisfies DocumentListRow[],
  });
};

async function ingestBuffer(
  originalName: string,
  buffer: Buffer,
  onProgress: (progress: DocumentIngestProgress) => void,
): Promise<DocumentIngestResult> {
  const isPdfName = originalName.toLowerCase().endsWith(".pdf");
  const isPdfContent = buffer.subarray(0, 5).toString() === "%PDF-";

  if (!isPdfName || !isPdfContent) {
    throw new Error("Only PDF uploads are supported.");
  }

  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const savedName = `${contentHash.slice(0, 16)}.pdf`;
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
      title: originalName.replace(/\.pdf$/i, "").trim() || originalName,
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
    throw new Error("Select a PDF file inside your home folder.");
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
    throw error(400, "Upload one PDF file per request.");
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
