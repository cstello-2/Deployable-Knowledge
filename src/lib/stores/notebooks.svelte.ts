import { NotebooksService } from '$lib/services';
import type {
	NotebookPage,
	NotebookSourceItem,
	NotebookStateResponse,
	NotebookWithPages
} from '$lib/types';

class NotebooksStore {
	private _notebooks = $state<NotebookWithPages[]>([]);
	private _activeNotebookId = $state<string | null>(null);
	private _sources = $state<NotebookSourceItem[]>([]);
	exportingNotebookId = $state<string | null>(null);
	exportingPageId = $state<string | null>(null);
	loading = $state(false);
	reordering = $state(false);
	sourcesLoading = $state(false);
	error = $state<string | null>(null);

	browseImportDirectory(path = '') {
		return NotebooksService.browseImportDirectory(path);
	}

	get notebooks(): readonly NotebookWithPages[] {
		return this._notebooks;
	}

	get activeNotebookId(): string | null {
		return this._activeNotebookId;
	}

	get activeNotebook(): NotebookWithPages | null {
		return this._notebooks.find(({ id }) => id === this._activeNotebookId) ?? null;
	}

	get activePage(): NotebookPage | null {
		const notebook = this.activeNotebook;
		return (
			notebook?.pages.find(({ id }) => id === notebook.activePageId) ?? notebook?.pages[0] ?? null
		);
	}

	get sources(): readonly NotebookSourceItem[] {
		return this._sources;
	}

	async load(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			this.apply(await NotebooksService.list());
		} catch (error) {
			this.error = message(error);
		} finally {
			this.loading = false;
		}
	}

	async create(title: string): Promise<void> {
		this.apply(await NotebooksService.create(title));
	}

	async select(id: string): Promise<void> {
		this.apply(await NotebooksService.select(id));
	}

	async rename(id: string, title: string): Promise<void> {
		this.apply(await NotebooksService.rename(id, title));
	}

	async delete(id: string): Promise<void> {
		this.apply(await NotebooksService.delete(id));
	}

	async moveNotebook(movingId: string, targetIndex: number): Promise<void> {
		if (this.reordering) return;
		const previous = this._notebooks;
		const next = moveById(previous, movingId, targetIndex);
		if (!next) return;

		this.reordering = true;
		this._notebooks = next;
		try {
			await NotebooksService.reorderNotebooks(next.map(({ id }) => id));
		} catch (error) {
			this._notebooks = previous;
			throw error;
		} finally {
			this.reordering = false;
		}
	}

	async exportNotebook(id: string): Promise<string | null> {
		if (this.exportingNotebookId || this.exportingPageId) return null;

		this.exportingNotebookId = id;

		try {
			return await NotebooksService.exportNotebook(id);
		} finally {
			this.exportingNotebookId = null;
		}
	}

	async exportPage(notebookId: string, pageId: string): Promise<string | null> {
		if (this.exportingNotebookId || this.exportingPageId) return null;

		this.exportingPageId = pageId;

		try {
			return await NotebooksService.exportPage(notebookId, pageId);
		} finally {
			this.exportingPageId = null;
		}
	}

	async importCollection(path: string): Promise<void> {
		if (!path.trim()) return;
		this.apply(await NotebooksService.importCollection(path));
	}

	async importMarkdown(path: string): Promise<void> {
		if (!this._activeNotebookId) {
			await this.load();
		}

		const notebookId = this._activeNotebookId;
		if (!notebookId) {
			throw new Error('Create or open a notebook before importing a Markdown or text file.');
		}

		this.apply(await NotebooksService.importMarkdown(notebookId, path));
	}

	async createPage(notebookId: string, title: string): Promise<void> {
		this.apply(await NotebooksService.createPage(notebookId, title));
	}

	async selectPage(notebookId: string, pageId: string): Promise<void> {
		this.apply(await NotebooksService.selectPage(notebookId, pageId));
	}

	async updatePage(notebookId: string, pageId: string, content: string): Promise<void> {
		this.apply(await NotebooksService.updatePage(notebookId, pageId, content));
	}

	async appendToActivePage(text: string): Promise<void> {
		const notebook = this.activeNotebook;
		const page = this.activePage;
		if (!notebook || !page) throw new Error('Open a notebook page first.');
		const separator = page.content.trim() ? '\n\n' : '';
		await this.updatePage(notebook.id, page.id, `${page.content}${separator}${text}`);
	}

	async renamePage(notebookId: string, pageId: string, title: string): Promise<void> {
		this.apply(await NotebooksService.renamePage(notebookId, pageId, title));
	}

	async deletePage(notebookId: string, pageId: string): Promise<void> {
		this.apply(await NotebooksService.deletePage(notebookId, pageId));
	}

	async movePage(notebookId: string, pageId: string, destinationNotebookId: string): Promise<void> {
		this.apply(await NotebooksService.movePage(notebookId, pageId, destinationNotebookId));
	}

	async reorderPage(notebookId: string, movingId: string, targetIndex: number): Promise<void> {
		if (this.reordering) return;
		const notebook = this._notebooks.find(({ id }) => id === notebookId);
		if (!notebook) return;

		const pages = moveById(notebook.pages, movingId, targetIndex);
		if (!pages) return;

		const previous = this._notebooks;
		this.reordering = true;
		this._notebooks = this._notebooks.map((candidate) =>
			candidate.id === notebookId ? { ...candidate, pages } : candidate
		);
		try {
			await NotebooksService.reorderPages(
				notebookId,
				pages.map(({ id }) => id)
			);
		} catch (error) {
			this._notebooks = previous;
			throw error;
		} finally {
			this.reordering = false;
		}
	}

	async loadSources(): Promise<void> {
		if (!this._activeNotebookId) {
			this._sources = [];
			return;
		}
		this.sourcesLoading = true;
		try {
			this._sources = (await NotebooksService.listSources(this._activeNotebookId)).sources;
		} finally {
			this.sourcesLoading = false;
		}
	}

	async addSources(chunkIds: string[]): Promise<void> {
		if (!this._activeNotebookId || !chunkIds.length) return;
		await NotebooksService.addSources(this._activeNotebookId, chunkIds);
		await this.loadSources();
	}

	async saveChunk(chunkId: string): Promise<string> {
		await this.load();
		const notebook = this.activeNotebook;
		if (!notebook) throw new Error('Create or open a notebook first.');
		await this.addSources([chunkId]);
		return notebook.title;
	}

	async removeSource(sourceId: string): Promise<void> {
		if (!this._activeNotebookId) return;
		await NotebooksService.removeSource(this._activeNotebookId, sourceId);
		await this.loadSources();
	}

	async clearSources(): Promise<void> {
		if (!this._activeNotebookId) return;
		await NotebooksService.clearSources(this._activeNotebookId);
		this._sources = [];
	}

	private apply(state: NotebookStateResponse): void {
		this._notebooks = state.notebooks;
		this._activeNotebookId = state.activeNotebookId ?? state.notebooks[0]?.id ?? null;
		void this.loadSources().catch((error) => {
			this.error = message(error);
		});
	}
}

function moveById<T extends { id: string; sortOrder: number }>(
	items: readonly T[],
	movingId: string,
	targetIndex: number
): T[] | null {
	const currentIndex = items.findIndex(({ id }) => id === movingId);
	if (currentIndex < 0 || !Number.isInteger(targetIndex)) return null;

	const insertIndex = Math.max(0, Math.min(targetIndex, items.length - 1));
	if (insertIndex === currentIndex) return null;

	const next = [...items];
	const [moving] = next.splice(currentIndex, 1);
	next.splice(insertIndex, 0, moving);
	return next.map((item, sortOrder) => ({ ...item, sortOrder }));
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const notebooksStore = new NotebooksStore();
