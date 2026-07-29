import { randomUUID } from 'node:crypto';
import { and, asc, eq, max } from 'drizzle-orm';
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

export interface NotebookPageInput {
	content: string;
	title: string;
}

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
			sortOrder: 0,
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
			.orderBy(asc(notebooks.sortOrder), asc(notebooks.createdAt))
			.limit(1);
		if (!notebook) return null;

		const pages = await db
			.select()
			.from(notebookPages)
			.where(eq(notebookPages.notebookId, id))
			.orderBy(asc(notebookPages.sortOrder), asc(notebookPages.createdAt));
		return { ...notebook, pages };
	}

	static async createPage(notebookId: string, title: string, content: string): Promise<string> {
		const pageId = randomUUID();
		const timestamp = new Date().toISOString();
		const [result] = await db
			.select({ maximum: max(notebookPages.sortOrder) })
			.from(notebookPages)
			.where(eq(notebookPages.notebookId, notebookId));
		const page: NewNotebookPage = {
			id: pageId,
			notebookId,
			title,
			content,
			sortOrder: (result?.maximum ?? -1) + 1,
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

	static async createWithPages(
		title: string,
		pages: readonly NotebookPageInput[]
	): Promise<string> {
		if (!pages.length) {
			throw new Error('A notebook requires at least one page.');
		}

		const now = Date.now();
		const notebookId = randomUUID();
		const [result] = await db
			.select({ maximum: max(notebooks.sortOrder) })
			.from(notebooks)
			.where(eq(notebooks.userId, NOTEBOOK_USER_ID));

		const pageRows: NewNotebookPage[] = pages.map(({ title, content }, index) => {
			const timestamp = new Date(now + index).toISOString();

			return {
				id: randomUUID(),
				notebookId,
				title,
				content,
				sortOrder: index,
				createdAt: timestamp,
				updatedAt: timestamp
			};
		});

		const timestamp = new Date(now).toISOString();
		const notebook: NewNotebook = {
			id: notebookId,
			userId: NOTEBOOK_USER_ID,
			title,
			activePageId: pageRows[0].id,
			sortOrder: (result?.maximum ?? -1) + 1,
			createdAt: timestamp,
			updatedAt: timestamp
		};

		const state: NewNotebookState = {
			userId: NOTEBOOK_USER_ID,
			activeNotebookId: notebookId,
			updatedAt: timestamp
		};

		await db.transaction(async (transaction) => {
			await transaction.insert(notebooks).values(notebook);
			await transaction.insert(notebookPages).values(pageRows);
			await transaction
				.insert(notebookState)
				.values(state)
				.onConflictDoUpdate({
					target: notebookState.userId,
					set: { activeNotebookId: notebookId, updatedAt: timestamp }
				});
		});

		return notebookId;
	}

	static async reorderNotebooks(orderedIds: readonly string[]): Promise<boolean> {
		const current = await db
			.select({ id: notebooks.id })
			.from(notebooks)
			.where(eq(notebooks.userId, NOTEBOOK_USER_ID));
		if (!hasExactIds(current, orderedIds)) return false;

		await db.transaction(async (transaction) => {
			for (const [sortOrder, id] of orderedIds.entries()) {
				await transaction
					.update(notebooks)
					.set({ sortOrder })
					.where(and(eq(notebooks.id, id), eq(notebooks.userId, NOTEBOOK_USER_ID)));
			}
		});
		return true;
	}

	static async reorderPages(notebookId: string, orderedIds: readonly string[]): Promise<boolean> {
		const [notebook] = await db
			.select({ id: notebooks.id })
			.from(notebooks)
			.where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, NOTEBOOK_USER_ID)))
			.limit(1);
		if (!notebook) return false;

		const current = await db
			.select({ id: notebookPages.id })
			.from(notebookPages)
			.where(eq(notebookPages.notebookId, notebookId));
		if (!hasExactIds(current, orderedIds)) return false;

		await db.transaction(async (transaction) => {
			for (const [sortOrder, id] of orderedIds.entries()) {
				await transaction
					.update(notebookPages)
					.set({ sortOrder })
					.where(and(eq(notebookPages.id, id), eq(notebookPages.notebookId, notebookId)));
			}
		});
		return true;
	}

	static async loadState(): Promise<NotebookStateResponse> {
		let notebookRows: Notebook[] = await db
			.select()
			.from(notebooks)
			.where(eq(notebooks.userId, NOTEBOOK_USER_ID))
			.orderBy(asc(notebooks.sortOrder), asc(notebooks.createdAt));

		if (!notebookRows.length) {
			await this.createDefault();
			notebookRows = await db
				.select()
				.from(notebooks)
				.where(eq(notebooks.userId, NOTEBOOK_USER_ID))
				.orderBy(asc(notebooks.sortOrder), asc(notebooks.createdAt));
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
				.orderBy(asc(notebookPages.sortOrder), asc(notebookPages.createdAt));
			output.push({ ...notebook, pages });
		}

		const activeNotebookId =
			notebookRows.find(({ id }) => id === state?.activeNotebookId)?.id ??
			notebookRows[0]?.id ??
			null;
		return { activeNotebookId, notebooks: output };
	}
}

function hasExactIds(current: readonly { id: string }[], orderedIds: readonly string[]): boolean {
	if (current.length !== orderedIds.length) return false;
	const currentIds = new Set(current.map(({ id }) => id));
	return (
		new Set(orderedIds).size === orderedIds.length && orderedIds.every((id) => currentIds.has(id))
	);
}

export const createDefaultNotebook = () => NotebooksRepository.createDefault();
export const loadNotebookState = () => NotebooksRepository.loadState();
export const setActiveNotebook = (notebookId: string | null) =>
	NotebooksRepository.setActive(notebookId);
