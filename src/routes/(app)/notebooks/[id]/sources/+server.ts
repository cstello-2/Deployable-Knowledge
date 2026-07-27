import { randomUUID } from "node:crypto";
import { json, type RequestHandler } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";
import type { NotebookSourcesRequest } from "$lib/requestTypes";
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
  Pick<DocumentChunk, "pageIndex"> &
  Pick<Document, "sourceType"> & {
    documentId: Document["id"];
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
      documentId: documents.id,
      documentTitle: documents.title,
      sourceType: documents.sourceType,
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
        documentId: row.documentId,
        documentTitle: row.documentTitle,
        sourceType: row.sourceType,
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

  const body = (await request.json()) as NotebookSourcesRequest;
  const chunkIds = [...new Set(
    (Array.isArray(body.chunk_ids) ? body.chunk_ids : [])
      .map((chunkId) => String(chunkId).trim())
      .filter(Boolean),
  )];

  let added = 0;
  if (chunkIds.length) {
    const createdAt = new Date().toISOString();
    const result = await db
      .insert(notebook_sources)
      .values(chunkIds.map((chunkId) => ({ id: randomUUID(), notebookId, chunkId, createdAt })))
      .onConflictDoNothing({
        target: [notebook_sources.notebookId, notebook_sources.chunkId],
      });
    added = result.rowsAffected;
  }

  return json({ ok: true, added });
};

// Clear every source attached to this notebook.
export const DELETE: RequestHandler = async ({ params }) => {
  const notebookId = params.id;
  if (!notebookId) return json({ error: "Missing notebook id" }, { status: 400 });

  await db.delete(notebook_sources).where(eq(notebook_sources.notebookId, notebookId));
  return json({ ok: true });
};
