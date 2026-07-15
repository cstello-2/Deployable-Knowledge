import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { count, desc, eq } from "drizzle-orm";
import { error, json } from "@sveltejs/kit";
import { db } from "$lib/server/database/database";
import { document_chunks, documents, synced_files, type Document } from "$lib/server/database/schema";
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

async function ingestUpload(upload: File): Promise<UploadResult> {
  const originalName = upload.name || "document.pdf";
  const isPdfName = originalName.toLowerCase().endsWith(".pdf");
  const buffer = Buffer.from(await upload.arrayBuffer());
  const isPdfContent = buffer.subarray(0, 5).toString() === "%PDF-";

  if (!isPdfName || !isPdfContent) {
    throw new Error("Only PDF uploads are supported.");
  }

  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const savedName = `${contentHash.slice(0, 16)}.pdf`;
  const savedPath = join(DOCUMENTS_DIR, savedName);

  await writeFile(savedPath, buffer);

  const result = await ingestDocument({
    filePath: savedPath,
    title: originalName.replace(/\.pdf$/i, "").trim() || originalName,
  });

  return { status: "success", filename: originalName, ...result };
}

export const POST: RequestHandler = async ({ request }) => {
  const form = await request.formData();
  const uploads = [...form.getAll("files"), ...form.getAll("file")].filter(
    (upload): upload is File => upload instanceof File,
  );

  if (uploads.length === 0) {
    throw error(400, "Upload at least one PDF file.");
  }

  await mkdir(DOCUMENTS_DIR, { recursive: true });
  const results: UploadResult[] = [];

  // Keep document ingestion sequential until Scribe's shared worker lifecycle is concurrency-safe.
  for (const upload of uploads) {
    try {
      results.push(await ingestUpload(upload));
    } catch (uploadError) {
      results.push({
        status: "error",
        filename: upload.name || "document.pdf",
        message: uploadError instanceof Error ? uploadError.message : String(uploadError),
      });
    }
  }

  return json({ uploads: results });
};
