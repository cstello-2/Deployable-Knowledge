import { json, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { ApiNotebookPageTitleRequest } from '$lib/types';
import { db } from '$lib/server/database/database';
import { notebooks, notebookPages, type NewNotebookPage } from '$lib/server/database/schema';
import {
	loadNotebookState,
	setActiveNotebook
} from '$lib/server/repositories/notebooks.repository';

export const POST: RequestHandler = async ({ params, request }) => {
	const notebookId = params.id;
	if (!notebookId) return json({ error: 'Missing notebook id' }, { status: 400 });
	const body = (await request.json()) as ApiNotebookPageTitleRequest;
	const title = body.title.trim();
	if (!title) {
		return json({ error: 'Page title is required' }, { status: 400 });
	}

	const timestamp = new Date().toISOString();
	const pageId = randomUUID();

	const page: NewNotebookPage = {
		id: pageId,
		notebookId,
		title,
		content: '',
		createdAt: timestamp,
		updatedAt: timestamp
	};

	await db.insert(notebookPages).values(page);
	await db
		.update(notebooks)
		.set({ activePageId: pageId, updatedAt: timestamp })
		.where(eq(notebooks.id, notebookId));
	await setActiveNotebook(notebookId);

	return json(await loadNotebookState(), { status: 201 });
};
