import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { error } from "@sveltejs/kit";
import type { DocumentIngestEvent } from "$lib/requestTypes";
import { ingestDocument } from "$lib/server/rag/ingest-document";
import type { RequestHandler } from "./$types";

const DOCUMENTS_DIR = "documents";

export const POST: RequestHandler = async ({ request }) => {
  const form = await request.formData();
  const upload = form.get("file");

  if (!(upload instanceof File)) {
    throw error(400, "Upload a PDF file.");
  }

  const originalName = upload.name || "document.pdf";
  const isPdfName = originalName.toLowerCase().endsWith(".pdf");
  const buffer = Buffer.from(await upload.arrayBuffer());
  const isPdfContent = buffer.subarray(0, 5).toString() === "%PDF-";

  if (!isPdfName || !isPdfContent) {
    throw error(400, "Only PDF uploads are supported.");
  }

  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const savedName = `${contentHash.slice(0, 16)}.pdf`;
  const savedPath = join(DOCUMENTS_DIR, savedName);

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
