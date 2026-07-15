import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { count, desc, eq } from "drizzle-orm";
import { error, json } from "@sveltejs/kit";
import { db } from "$lib/server/database/database";
import { document_chunks, documents, synced_files, type Document } from "$lib/server/database/schema";
import { containsPath } from "$lib/server/documents/remove-document";
import { ingestDocument } from "$lib/server/rag/ingest-document";
import type { RequestHandler } from "./$types";

const DOCUMENTS_DIR = "documents";

type UploadResult = {
  status: "success" | "error";
  filename: string;
  documentId?: string;
  title?: string;
  chunkCount?: number;
  message?: string;
};

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

async function ingestBuffer(originalName: string, buffer: Buffer): Promise<UploadResult> {
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
      chunkCount: count(document_chunks.id),
    })
    .from(documents)
    .leftJoin(document_chunks, eq(document_chunks.documentId, documents.id))
    .where(eq(documents.sourcePath, savedPath))
    .groupBy(documents.id)
    .limit(1);

  if (existing) {
    return {
      status: "success",
      filename: originalName,
      ...existing,
      chunkCount: Number(existing.chunkCount ?? 0),
      message: "This PDF is already in the library.",
    };
  }

  await writeFile(savedPath, buffer);

  const result = await ingestDocument({
    filePath: savedPath,
    title: originalName.replace(/\.pdf$/i, "").trim() || originalName,
  });

  return { status: "success", filename: originalName, ...result };
}

async function ingestPath(filePath: string): Promise<UploadResult> {
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
      chunkCount: count(document_chunks.id),
    })
    .from(synced_files)
    .innerJoin(documents, eq(documents.id, synced_files.documentId))
    .leftJoin(document_chunks, eq(document_chunks.documentId, documents.id))
    .where(eq(synced_files.sourcePath, path))
    .groupBy(documents.id)
    .limit(1);

  if (tracked) {
    return {
      status: "success",
      filename: basename(path),
      ...tracked,
      chunkCount: Number(tracked.chunkCount ?? 0),
      message: "This PDF is already managed by its folder.",
    };
  }

  return ingestBuffer(basename(path), await readFile(path));
}

export const POST: RequestHandler = async ({ request }) => {
  const { paths } = (await request.json()) as { paths?: unknown };
  const selectedPaths = Array.isArray(paths)
    ? paths.filter((path): path is string => typeof path === "string")
    : [];

  if (selectedPaths.length === 0) {
    throw error(400, "Upload at least one PDF file.");
  }

  await mkdir(DOCUMENTS_DIR, { recursive: true });
  const results: UploadResult[] = [];

  // Keep document ingestion sequential until Scribe's shared worker lifecycle is concurrency-safe.
  for (const path of selectedPaths) {
    try {
      results.push(await ingestPath(path));
    } catch (uploadError) {
      results.push({
        status: "error",
        filename: basename(path) || "document.pdf",
        message: uploadError instanceof Error ? uploadError.message : String(uploadError),
      });
    }
  }

  return json({ uploads: results });
};
