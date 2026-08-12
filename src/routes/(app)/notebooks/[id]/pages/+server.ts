import { json, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq, max } from 'drizzle-orm';
import type { ApiNotebookPageTitleRequest, ApiReorderResponse } from '$lib/types';
import { db } from '$lib/server/database/database';
import { notebooks, notebookPages, type NewNotebookPage } from '$lib/server/database/schema';
import { parseReorderRequest } from '$lib/server/utils/reorder';
import {
	loadNotebookState,
	NotebooksRepository,
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
	const [result] = await db
		.select({ maximum: max(notebookPages.sortOrder) })
		.from(notebookPages)
		.where(eq(notebookPages.notebookId, notebookId));

	const page: NewNotebookPage = {
		id: pageId,
		notebookId,
		title,
		content: '',
		sortOrder: (result?.maximum ?? -1) + 1,
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

export const PATCH: RequestHandler = async ({ params, request }) => {
	const notebookId = params.id;
	if (!notebookId) return json({ error: 'Missing notebook id' }, { status: 400 });

	const body = parseReorderRequest(await request.json().catch(() => null));
	if (!body) return json({ error: 'Invalid page order' }, { status: 400 });

	if (!(await NotebooksRepository.reorderPages(notebookId, body.orderedIds))) {
		return json({ error: 'Page order is out of date' }, { status: 409 });
	}

	return json({ ok: true } satisfies ApiReorderResponse);
};
