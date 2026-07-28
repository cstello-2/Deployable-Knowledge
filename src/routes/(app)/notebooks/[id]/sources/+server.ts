import { randomUUID } from 'node:crypto';
import { json, type RequestHandler } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { ApiNotebookSourcesRequest } from '$lib/types';
import { db } from '$lib/server/database/database';
import {
	documentChunks,
	documents,
	notebookSources,
	type Document,
	type DocumentChunk,
	type NotebookSource
} from '$lib/server/database/schema';

const PREVIEW_CHARS = 220;

function preview(text: string, limit = PREVIEW_CHARS): string {
	const compact = text.replace(/\s+/g, ' ').trim();
	return compact.length <= limit ? compact : `${compact.slice(0, limit).trimEnd()}...`;
}

// Every real field is derived from the schema types (not hand-typed) — only
// `preview` is computed and has no column of its own.
export type NotebookSourceItem = Pick<NotebookSource, 'id' | 'chunkId' | 'createdAt'> &
	Pick<DocumentChunk, 'pageIndex'> & {
		documentId: Document['id'];
		documentTitle: Document['title'];
		sourceType: Document['sourceType'];
		preview: string;
	};

// Sources attached to a notebook (via "Send to Notebook") — hidden from the
// notebook page text, but visible here and to notebook-mode chat server-side.
export const GET: RequestHandler = async ({ params }) => {
	const notebookId = params.id;
	if (!notebookId) return json({ error: 'Missing notebook id' }, { status: 400 });

	const rows = await db
		.select({
			id: notebookSources.id,
			chunkId: notebookSources.chunkId,
			documentId: documents.id,
			documentTitle: documents.title,
			sourceType: documents.sourceType,
			pageIndex: documentChunks.pageIndex,
			content: documentChunks.content,
			createdAt: notebookSources.createdAt
		})
		.from(notebookSources)
		.innerJoin(documentChunks, eq(documentChunks.id, notebookSources.chunkId))
		.innerJoin(documents, eq(documents.id, documentChunks.documentId))
		.where(eq(notebookSources.notebookId, notebookId))
		.orderBy(asc(notebookSources.createdAt));

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
				createdAt: row.createdAt
			})
		)
	});
};

// Attach chunk ids to this notebook (deduped — re-sending an already-attached
// chunk is a no-op).
export const POST: RequestHandler = async ({ params, request }) => {
	const notebookId = params.id;
	if (!notebookId) return json({ error: 'Missing notebook id' }, { status: 400 });

	const body = (await request.json()) as ApiNotebookSourcesRequest;
	const chunkIds = [...new Set(body.chunk_ids.map((chunkId) => chunkId.trim()))];

	if (chunkIds.length) {
		const createdAt = new Date().toISOString();
		await db
			.insert(notebookSources)
			.values(chunkIds.map((chunkId) => ({ id: randomUUID(), notebookId, chunkId, createdAt })))
			.onConflictDoNothing({
				target: [notebookSources.notebookId, notebookSources.chunkId]
			});
	}

	return json({ ok: true, added: chunkIds.length });
};

// Clear every source attached to this notebook.
export const DELETE: RequestHandler = async ({ params }) => {
	const notebookId = params.id;
	if (!notebookId) return json({ error: 'Missing notebook id' }, { status: 400 });

	await db.delete(notebookSources).where(eq(notebookSources.notebookId, notebookId));
	return json({ ok: true });
};
