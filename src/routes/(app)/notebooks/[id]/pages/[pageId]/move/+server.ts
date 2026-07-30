import { randomUUID } from 'node:crypto';
import { json, type RequestHandler } from '@sveltejs/kit';
import { and, asc, eq, max } from 'drizzle-orm';
import type { ApiNotebookPageMoveRequest } from '$lib/types';
import { db } from '$lib/server/database/database';
import { notebookPages, notebooks, type NewNotebookPage } from '$lib/server/database/schema';
import {
	loadNotebookState,
	setActiveNotebook
} from '$lib/server/repositories/notebooks.repository';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const sourceNotebookId = params.id;
	const pageId = params.pageId;
	if (!sourceNotebookId || !pageId) {
		return json({ error: 'Missing notebook or page id' }, { status: 400 });
	}

	const { destinationNotebookId } = (await request.json()) as ApiNotebookPageMoveRequest;
	if (!destinationNotebookId || destinationNotebookId === sourceNotebookId) {
		return json({ error: 'Choose a different destination notebook' }, { status: 400 });
	}

	const [[sourceNotebook], [destinationNotebook], [page]] = await Promise.all([
		db
			.select({ activePageId: notebooks.activePageId })
			.from(notebooks)
			.where(eq(notebooks.id, sourceNotebookId))
			.limit(1),
		db
			.select({ id: notebooks.id })
			.from(notebooks)
			.where(eq(notebooks.id, destinationNotebookId))
			.limit(1),
		db
			.select()
			.from(notebookPages)
			.where(and(eq(notebookPages.id, pageId), eq(notebookPages.notebookId, sourceNotebookId)))
			.limit(1)
	]);
	if (!sourceNotebook || !page) {
		return json({ error: 'Notebook page not found' }, { status: 404 });
	}
	if (!destinationNotebook) {
		return json({ error: 'Destination notebook not found' }, { status: 404 });
	}

	const destinationTitles = (
		await db
			.select({ title: notebookPages.title })
			.from(notebookPages)
			.where(eq(notebookPages.notebookId, destinationNotebookId))
	).map(({ title }) => title);
	const movedTitle = uniquePageTitle(page.title, destinationTitles);
	const timestamp = new Date().toISOString();

	await db.transaction(async (transaction) => {
		const [destinationOrder] = await transaction
			.select({ maximum: max(notebookPages.sortOrder) })
			.from(notebookPages)
			.where(eq(notebookPages.notebookId, destinationNotebookId));
		await transaction
			.update(notebookPages)
			.set({
				notebookId: destinationNotebookId,
				sortOrder: (destinationOrder?.maximum ?? -1) + 1,
				title: movedTitle,
				updatedAt: timestamp
			})
			.where(and(eq(notebookPages.id, pageId), eq(notebookPages.notebookId, sourceNotebookId)));
		await transaction
			.update(notebooks)
			.set({ activePageId: pageId, updatedAt: timestamp })
			.where(eq(notebooks.id, destinationNotebookId));

		const remainingPages = await transaction
			.select({ id: notebookPages.id })
			.from(notebookPages)
			.where(eq(notebookPages.notebookId, sourceNotebookId))
			.orderBy(asc(notebookPages.sortOrder), asc(notebookPages.createdAt));
		let sourceActivePageId = sourceNotebook.activePageId;
		if (!remainingPages.length) {
			sourceActivePageId = randomUUID();
			const replacement: NewNotebookPage = {
				id: sourceActivePageId,
				notebookId: sourceNotebookId,
				title: 'Page 1',
				content: '',
				sortOrder: 0,
				createdAt: timestamp,
				updatedAt: timestamp
			};
			await transaction.insert(notebookPages).values(replacement);
		} else if (
			sourceActivePageId === pageId ||
			!remainingPages.some(({ id }) => id === sourceActivePageId)
		) {
			sourceActivePageId = remainingPages[0].id;
		}
		await transaction
			.update(notebooks)
			.set({ activePageId: sourceActivePageId, updatedAt: timestamp })
			.where(eq(notebooks.id, sourceNotebookId));
	});

	await setActiveNotebook(sourceNotebookId);
	return json(await loadNotebookState());
};

function uniquePageTitle(title: string, existingTitles: string[]): string {
	const existing = new Set(existingTitles.map((value) => value.toLocaleLowerCase()));
	if (!existing.has(title.toLocaleLowerCase())) return title;
	let suffix = 2;
	while (existing.has(`${title} (${suffix})`.toLocaleLowerCase())) suffix += 1;
	return `${title} (${suffix})`;
}
