import { json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { notebooks, notebookPages } from '$lib/server/database/schema';
import {
	loadNotebookState,
	setActiveNotebook
} from '$lib/server/repositories/notebooks.repository';

export const POST: RequestHandler = async ({ params }) => {
	const notebookId = params.id;
	const pageId = params.pageId;
	if (!notebookId || !pageId) return json({ error: 'Missing id' }, { status: 400 });

	const [page] = await db.select().from(notebookPages).where(eq(notebookPages.id, pageId)).limit(1);

	if (!page || page.notebookId !== notebookId) {
		return json({ error: 'Page not found' }, { status: 404 });
	}

	await db
		.update(notebooks)
		.set({ activePageId: pageId, updatedAt: new Date().toISOString() })
		.where(eq(notebooks.id, notebookId));
	await setActiveNotebook(notebookId);

	return json(await loadNotebookState());
};
