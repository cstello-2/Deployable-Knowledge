import { json, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq, max } from 'drizzle-orm';
import type { ApiNotebookTitleRequest, ApiReorderResponse } from '$lib/types';
import { db } from '$lib/server/database/database';
import {
	notebooks,
	notebookPages,
	type NewNotebook,
	type NewNotebookPage
} from '$lib/server/database/schema';
import {
	loadNotebookState,
	NotebooksRepository,
	setActiveNotebook
} from '$lib/server/repositories/notebooks.repository';
import { NOTEBOOK_USER_ID } from '$lib/server/database/constants';
import { parseReorderRequest } from '$lib/server/notebooks/notebook-order';

export const GET: RequestHandler = async () => {
	return json(await loadNotebookState());
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ApiNotebookTitleRequest;
	const title = body.title.trim();
	if (!title) {
		return json({ error: 'Notebook title is required' }, { status: 400 });
	}

	const timestamp = new Date().toISOString();
	const notebookId = randomUUID();
	const pageId = randomUUID();
	const [result] = await db
		.select({ maximum: max(notebooks.sortOrder) })
		.from(notebooks)
		.where(eq(notebooks.userId, NOTEBOOK_USER_ID));

	const notebook: NewNotebook = {
		id: notebookId,
		userId: NOTEBOOK_USER_ID,
		title,
		activePageId: pageId,
		sortOrder: (result?.maximum ?? -1) + 1,
		createdAt: timestamp,
		updatedAt: timestamp
	};

	const page: NewNotebookPage = {
		id: pageId,
		notebookId,
		title: 'Page 1',
		content: '',
		sortOrder: 0,
		createdAt: timestamp,
		updatedAt: timestamp
	};

	await db.insert(notebooks).values(notebook);
	await db.insert(notebookPages).values(page);
	await setActiveNotebook(notebookId);

	return json(await loadNotebookState(), { status: 201 });
};

export const PATCH: RequestHandler = async ({ request }) => {
	const body = parseReorderRequest(await request.json().catch(() => null));
	if (!body) return json({ error: 'Invalid notebook order' }, { status: 400 });

	if (!(await NotebooksRepository.reorderNotebooks(body.orderedIds))) {
		return json({ error: 'Notebook order is out of date' }, { status: 409 });
	}

	return json({ ok: true } satisfies ApiReorderResponse);
};
