import { randomUUID } from 'node:crypto';
import { json, type RequestHandler } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { NOTEBOOK_TEXT_CHARACTER_LIMIT } from '$lib/constants';
import type { ApiNotebookPageContentRequest, ApiNotebookPageTitleRequest } from '$lib/types';
import { db } from '$lib/server/database/database';
import {
	notebookPages,
	notebooks,
	type NewNotebookPage,
	type NotebookPage
} from '$lib/server/database/schema';
import {
	loadNotebookState,
	setActiveNotebook
} from '$lib/server/repositories/notebooks.repository';
import { countNotebookText } from '$lib/utils/notebook-text';

type PagePatch = Partial<ApiNotebookPageContentRequest & ApiNotebookPageTitleRequest>;

export const PATCH: RequestHandler = async ({ params, request }) => {
	const notebookId = params.id;
	const pageId = params.pageId;
	if (!notebookId || !pageId) return json({ error: 'Missing id' }, { status: 400 });
	const body = (await request.json()) as PagePatch;
	const pages = await db
		.select({ id: notebookPages.id, content: notebookPages.content })
		.from(notebookPages)
		.where(eq(notebookPages.notebookId, notebookId));
	if (!pages.some(({ id }) => id === pageId)) {
		return json({ error: 'Notebook page not found' }, { status: 404 });
	}

	const changes: { content?: string; title?: string; updatedAt: string } = {
		updatedAt: new Date().toISOString()
	};
	if (typeof body.title === 'string') {
		const title = body.title.trim();
		if (!title) return json({ error: 'Page title is required' }, { status: 400 });
		changes.title = title;
	}
	if (typeof body.content === 'string') {
		const characterCount = countNotebookText(
			pages.map((page) => (page.id === pageId ? { content: body.content ?? '' } : page))
		);
		if (characterCount > NOTEBOOK_TEXT_CHARACTER_LIMIT) {
			return json(
				{
					error: 'Notebook text limit exceeded',
					characterCount,
					limit: NOTEBOOK_TEXT_CHARACTER_LIMIT
				},
				{ status: 413 }
			);
		}
		changes.content = body.content;
	}
	if (changes.title === undefined && changes.content === undefined) {
		return json({ error: 'Page title or content is required' }, { status: 400 });
	}

	await db
		.update(notebookPages)
		.set(changes)
		.where(and(eq(notebookPages.id, pageId), eq(notebookPages.notebookId, notebookId)));
	return json(await loadNotebookState());
};

export const DELETE: RequestHandler = async ({ params }) => {
	const notebookId = params.id;
	const pageId = params.pageId;
	if (!notebookId || !pageId) return json({ error: 'Missing id' }, { status: 400 });
	const timestamp = new Date().toISOString();
	const [page] = await db
		.select({ id: notebookPages.id })
		.from(notebookPages)
		.where(and(eq(notebookPages.id, pageId), eq(notebookPages.notebookId, notebookId)))
		.limit(1);
	if (!page) return json({ error: 'Notebook page not found' }, { status: 404 });

	await db
		.delete(notebookPages)
		.where(and(eq(notebookPages.id, pageId), eq(notebookPages.notebookId, notebookId)));
	const remaining: NotebookPage[] = await db
		.select()
		.from(notebookPages)
		.where(eq(notebookPages.notebookId, notebookId))
		.orderBy(asc(notebookPages.createdAt));

	let activePageId = remaining[0]?.id;
	if (!activePageId) {
		activePageId = randomUUID();
		const page: NewNotebookPage = {
			id: activePageId,
			notebookId,
			title: 'Page 1',
			content: '',
			createdAt: timestamp,
			updatedAt: timestamp
		};
		await db.insert(notebookPages).values(page);
	}
	await db
		.update(notebooks)
		.set({ activePageId, updatedAt: timestamp })
		.where(eq(notebooks.id, notebookId));
	await setActiveNotebook(notebookId);
	return json(await loadNotebookState());
};
