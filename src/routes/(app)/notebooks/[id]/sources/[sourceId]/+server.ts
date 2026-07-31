import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { notebookSources } from '$lib/server/database/schema';

// Remove a single attached source from a notebook.
export const DELETE: RequestHandler = async ({ params }) => {
	const notebookId = params.id;
	const sourceId = params.sourceId;
	if (!notebookId || !sourceId) {
		return json({ error: 'Missing notebook or source id' }, { status: 400 });
	}

	await db
		.delete(notebookSources)
		.where(and(eq(notebookSources.notebookId, notebookId), eq(notebookSources.id, sourceId)));

	return json({ ok: true });
};
