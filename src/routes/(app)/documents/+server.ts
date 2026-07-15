import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { error } from "@sveltejs/kit";
import type { DocumentIngestEvent } from "$lib/requestTypes";
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

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: DocumentIngestEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void (async () => {
        try {
          send({
            status: "progress",
            percent: 0,
            label: "Ingesting PDF",
            message: "Preparing OCR",
          });
          await mkdir(DOCUMENTS_DIR, { recursive: true });
          await writeFile(savedPath, buffer);

          const result = await ingestDocument(
            {
              filePath: savedPath,
              title: originalName.replace(/\.pdf$/i, "").trim() || originalName,
            },
            (progress) => send({ status: "progress", ...progress }),
          );

          send({
            status: "progress",
            percent: 100,
            label: "Ingesting PDF",
            message: "Complete",
          });
          send({ status: "complete", result });
        } catch (cause) {
          console.error("Document ingestion failed", cause);
          send({
            status: "error",
            message:
              cause instanceof Error
                ? cause.message
                : "Document ingestion failed",
          });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
};
