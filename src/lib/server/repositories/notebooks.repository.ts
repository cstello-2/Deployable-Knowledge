import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { NotebookStateResponse } from '$lib/types';
import { db } from '$lib/server/database/database';
import { NOTEBOOK_USER_ID } from '$lib/server/database/constants';
import {
	notebookPages,
	notebookState,
	notebooks,
	type NewNotebook,
	type NewNotebookPage,
	type NewNotebookState,
	type Notebook,
	type NotebookPage,
	type NotebookWithPages
} from '$lib/server/database/schema';

export class NotebooksRepository {
	static async createDefault(): Promise<string> {
		const timestamp = new Date().toISOString();
		const notebookId = randomUUID();
		const pageId = randomUUID();
		const notebook: NewNotebook = {
			id: notebookId,
			userId: NOTEBOOK_USER_ID,
			title: 'Notebook 1',
			activePageId: pageId,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		const page: NewNotebookPage = {
			id: pageId,
			notebookId,
			title: 'Page 1',
			content: '',
			createdAt: timestamp,
			updatedAt: timestamp
		};

		await db.insert(notebooks).values(notebook);
		await db.insert(notebookPages).values(page);
		await this.setActive(notebookId);
		return notebookId;
	}

	static async setActive(notebookId: string | null): Promise<void> {
		const updatedAt = new Date().toISOString();
		const state: NewNotebookState = {
			userId: NOTEBOOK_USER_ID,
			activeNotebookId: notebookId,
			updatedAt
		};
		await db
			.insert(notebookState)
			.values(state)
			.onConflictDoUpdate({
				target: notebookState.userId,
				set: { activeNotebookId: notebookId, updatedAt }
			});
	}

	static async findWithPages(id: string): Promise<NotebookWithPages | null> {
		const [notebook] = await db
			.select()
			.from(notebooks)
			.where(and(eq(notebooks.id, id), eq(notebooks.userId, NOTEBOOK_USER_ID)))
			.limit(1);
		if (!notebook) return null;

		const pages = await db
			.select()
			.from(notebookPages)
			.where(eq(notebookPages.notebookId, id))
			.orderBy(asc(notebookPages.createdAt));
		return { ...notebook, pages };
	}

	static async createPage(notebookId: string, title: string, content: string): Promise<string> {
		const pageId = randomUUID();
		const timestamp = new Date().toISOString();
		const page: NewNotebookPage = {
			id: pageId,
			notebookId,
			title,
			content,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		await db.transaction(async (transaction) => {
			await transaction.insert(notebookPages).values(page);
			await transaction
				.update(notebooks)
				.set({ activePageId: pageId, updatedAt: timestamp })
				.where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, NOTEBOOK_USER_ID)));
		});

		return pageId;
	}

	static async loadState(): Promise<NotebookStateResponse> {
		let notebookRows: Notebook[] = await db
			.select()
			.from(notebooks)
			.where(eq(notebooks.userId, NOTEBOOK_USER_ID))
			.orderBy(asc(notebooks.createdAt));

		if (!notebookRows.length) {
			await this.createDefault();
			notebookRows = await db
				.select()
				.from(notebooks)
				.where(eq(notebooks.userId, NOTEBOOK_USER_ID))
				.orderBy(asc(notebooks.createdAt));
		}

		const [state] = await db
			.select()
			.from(notebookState)
			.where(eq(notebookState.userId, NOTEBOOK_USER_ID))
			.limit(1);
		const output: NotebookWithPages[] = [];

		for (const notebook of notebookRows) {
			const pages: NotebookPage[] = await db
				.select()
				.from(notebookPages)
				.where(eq(notebookPages.notebookId, notebook.id))
				.orderBy(asc(notebookPages.createdAt));
			output.push({ ...notebook, pages });
		}

		const activeNotebookId =
			notebookRows.find(({ id }) => id === state?.activeNotebookId)?.id ??
			notebookRows[0]?.id ??
			null;
		return { activeNotebookId, notebooks: output };
	}
}

export const createDefaultNotebook = () => NotebooksRepository.createDefault();
export const loadNotebookState = () => NotebooksRepository.loadState();
export const setActiveNotebook = (notebookId: string | null) =>
	NotebooksRepository.setActive(notebookId);
