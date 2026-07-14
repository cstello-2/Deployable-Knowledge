import { randomUUID } from "node:crypto";
import { json, type RequestHandler } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  document_chunks,
  documents,
  notebook_sources,
  type Document,
  type DocumentChunk,
  type NotebookSource,
} from "$lib/server/database/schema";

const PREVIEW_CHARS = 220;

function preview(text: string, limit = PREVIEW_CHARS): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= limit ? compact : `${compact.slice(0, limit).trimEnd()}...`;
}

// Every real field is derived from the schema types (not hand-typed) — only
// `preview` is computed and has no column of its own.
export type NotebookSourceItem = Pick<NotebookSource, "id" | "chunkId" | "createdAt"> &
  Pick<DocumentChunk, "pageIndex"> & {
    documentTitle: Document["title"];
    preview: string;
  };

// Sources attached to a notebook (via "Send to Notebook") — hidden from the
// notebook page text, but visible here and to notebook-mode chat server-side.
export const GET: RequestHandler = async ({ params }) => {
  const notebookId = params.id;
  if (!notebookId) return json({ error: "Missing notebook id" }, { status: 400 });

  const rows = await db
    .select({
      id: notebook_sources.id,
      chunkId: notebook_sources.chunkId,
      documentTitle: documents.title,
      pageIndex: document_chunks.pageIndex,
      content: document_chunks.content,
      createdAt: notebook_sources.createdAt,
    })
    .from(notebook_sources)
    .innerJoin(document_chunks, eq(document_chunks.id, notebook_sources.chunkId))
    .innerJoin(documents, eq(documents.id, document_chunks.documentId))
    .where(eq(notebook_sources.notebookId, notebookId))
    .orderBy(asc(notebook_sources.createdAt));

  return json({
    sources: rows.map(
      (row): NotebookSourceItem => ({
        id: row.id,
        chunkId: row.chunkId,
        documentTitle: row.documentTitle,
        pageIndex: row.pageIndex,
        preview: preview(row.content),
        createdAt: row.createdAt,
      }),
    ),
  });
};

// Attach chunk ids to this notebook (deduped — re-sending an already-attached
// chunk is a no-op).
export const POST: RequestHandler = async ({ params, request }) => {
  const notebookId = params.id;
  if (!notebookId) return json({ error: "Missing notebook id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const chunkIds: string[] = Array.isArray(body?.chunk_ids)
    ? body.chunk_ids.map((value: unknown) => String(value).trim()).filter(Boolean)
    : [];

  if (chunkIds.length) {
    const createdAt = new Date().toISOString();
    await db
      .insert(notebook_sources)
      .values(chunkIds.map((chunkId) => ({ id: randomUUID(), notebookId, chunkId, createdAt })))
      .onConflictDoNothing({
        target: [notebook_sources.notebookId, notebook_sources.chunkId],
      });
  }

  return json({ ok: true, added: chunkIds.length });
};

// Clear every source attached to this notebook.
export const DELETE: RequestHandler = async ({ params }) => {
  const notebookId = params.id;
  if (!notebookId) return json({ error: "Missing notebook id" }, { status: 400 });

  await db.delete(notebook_sources).where(eq(notebook_sources.notebookId, notebookId));
  return json({ ok: true });
};
