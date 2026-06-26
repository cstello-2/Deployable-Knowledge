import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { json, error } from "@sveltejs/kit";
import { ingestDocument } from "$lib/server/rag/ingest-document";
import type { RequestHandler } from "./$types";

const DOCUMENTS_DIR = "documents";

function safePdfName(name: string) {
  const parsed = parse(name || "document.pdf");
  const base = parsed.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${base || "document"}.pdf`;
}

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
  const savedName = `${contentHash.slice(0, 16)}-${safePdfName(originalName)}`;
  const savedPath = join(DOCUMENTS_DIR, savedName);

  await mkdir(DOCUMENTS_DIR, { recursive: true });
  await writeFile(savedPath, buffer);

  const result = await ingestDocument({
    filePath: savedPath,
    title: originalName.replace(/\.pdf$/i, "").trim() || originalName,
  });

  return json(result);
};
