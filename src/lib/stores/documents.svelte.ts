import { SvelteSet } from 'svelte/reactivity';
import { LOOSE_DOCUMENT_GROUPS } from '$lib/constants';
import { DocumentsService } from '$lib/services';
import { DEFAULT_DOCUMENT_SORT } from '$lib/utils';
import type {
	ApiDocumentAutotagEntry,
	ApiDocumentAutotagResult,
	ApiDocumentIngestProgress,
	ApiDocumentListQuery,
	ApiDocumentListResponse,
	ApiDocumentSyncFileProgress,
	ApiSyncedFolder,
	DocumentListMode,
	DocumentSortMode
} from '$lib/types';

const PAGE_SIZE = 50;
const MAX_REFRESH_SIZE = 200;
const QUERY_DEBOUNCE_MS = 250;
// The per-file list is a running log of a sync, not a record of it. Keeping every
// entry of a several-thousand file sync would put that many rows in the dialog and
// grow the work of each update with the size of the corpus, so old entries are
// dropped in blocks once the log is full.
const SYNC_LOG_LIMIT = 200;
const SYNC_LOG_TRIM = 100;

interface DocumentGroupPage extends ApiDocumentListResponse {
	// Rows consumed from the server. Runs ahead of `documents.length` when an ingest
	// shifts shown rows into the next page and the repeats are dropped.
	offset: number;
}

class DocumentsStore {
	private _pages = $state.raw<Record<string, DocumentGroupPage>>({});
	private _loadingGroups = new SvelteSet<string>();
	private _tags = $state<string[]>([]);
	private _folders = $state<ApiSyncedFolder[]>([]);
	private _selectedIds = $state(new SvelteSet<string>());
	private _syncFiles = $state<ApiDocumentSyncFileProgress[]>([]);
	private _query = $state('');
	private _tagFilters = $state<string[]>([]);
	private _mode = $state<DocumentListMode>('all');
	private _sort = $state<DocumentSortMode>(DEFAULT_DOCUMENT_SORT);
	private _syncTotal = $state(0);
	private _syncSettled = $state(0);
	private _autotagEntries = $state<ApiDocumentAutotagEntry[]>([]);
	private _autotagSettled = $state(0);
	private _autotagTotal = $state(0);
	private queryTimer: ReturnType<typeof setTimeout> | undefined;
	private listRequest = 0;
	private syncFileIndex = new Map<string, number>();
	progress = $state<ApiDocumentIngestProgress | null>(null);
	syncProgress = $state<ApiDocumentIngestProgress | null>(null);
	autotagProgress = $state<ApiDocumentIngestProgress | null>(null);
	syncing = $state(false);
	autotagging = $state(false);
	loading = $state(false);
	error = $state<string | null>(null);

	/** Keyed by folder id or loose group. */
	get pages(): Record<string, ApiDocumentListResponse> {
		return this._pages;
	}

	get loadingGroups(): ReadonlySet<string> {
		return this._loadingGroups;
	}

	get tags(): string[] {
		return this._tags;
	}

	get folders(): ApiSyncedFolder[] {
		return this._folders;
	}

	get syncFiles(): ApiDocumentSyncFileProgress[] {
		return this._syncFiles;
	}

	get syncTotal(): number {
		return this._syncTotal;
	}

	get syncSettled(): number {
		return this._syncSettled;
	}

	get autotagEntries(): ApiDocumentAutotagEntry[] {
		return this._autotagEntries;
	}

	get autotagSettled(): number {
		return this._autotagSettled;
	}

	get autotagTotal(): number {
		return this._autotagTotal;
	}

	get selectedIds(): ReadonlySet<string> {
		return this._selectedIds;
	}

	get query(): string {
		return this._query;
	}

	get tagFilters(): string[] {
		return this._tagFilters;
	}

	get mode(): DocumentListMode {
		return this._mode;
	}

	get sort(): DocumentSortMode {
		return this._sort;
	}

	private get filtered(): boolean {
		return Boolean(this._query.trim()) || this._tagFilters.length > 0 || this._mode !== 'all';
	}

	async load(): Promise<void> {
		await this.fetchList(() => PAGE_SIZE);
	}

	async refresh(): Promise<void> {
		await this.fetchList((group) =>
			Math.min(Math.max(this._pages[group]?.documents.length ?? 0, PAGE_SIZE), MAX_REFRESH_SIZE)
		);
	}

	async loadMore(group: string): Promise<void> {
		const page = this._pages[group];
		if (!page || page.offset >= page.total) return;
		if (this.loading || this.error || this._loadingGroups.has(group)) return;
		const request = this.listRequest;
		this._loadingGroups.add(group);
		try {
			const result = await DocumentsService.list({
				...this.listQuery(),
				group,
				offset: page.offset,
				limit: PAGE_SIZE
			});
			if (request !== this.listRequest) return;
			const shown = new Set(page.documents.map(({ id }) => id));
			this._pages = {
				...this._pages,
				[group]: {
					documents: [...page.documents, ...result.documents.filter(({ id }) => !shown.has(id))],
					offset: page.offset + result.documents.length,
					total: result.total
				}
			};
		} catch (error) {
			if (request === this.listRequest) this.error = message(error);
		} finally {
			this._loadingGroups.delete(group);
		}
	}

	setQuery(value: string): void {
		this._query = value;
		clearTimeout(this.queryTimer);
		this.queryTimer = setTimeout(() => void this.load(), QUERY_DEBOUNCE_MS);
	}

	setMode(mode: DocumentListMode): void {
		if (this._mode === mode) return;
		this._mode = mode;
		void this.load();
	}

	toggleTagFilter(tag: string): void {
		this._tagFilters = this._tagFilters.includes(tag)
			? this._tagFilters.filter((item) => item !== tag)
			: [...this._tagFilters, tag];
		void this.load();
	}

	setSort(mode: DocumentSortMode): void {
		if (this._sort === mode) return;
		this._sort = mode;
		void this.load();
	}

	select(id: string): void {
		this._selectedIds.add(id);
	}

	toggle(id: string): void {
		if (!this._selectedIds.delete(id)) this._selectedIds.add(id);
	}

	setSelection(ids: string[], selected: boolean): void {
		for (const id of ids) {
			if (selected) this._selectedIds.add(id);
			else this._selectedIds.delete(id);
		}
	}

	async selectGroup(group: string, selected: boolean): Promise<void> {
		try {
			const result = await DocumentsService.listIds({ ...this.listQuery(), group });
			this.setSelection(result.ids, selected);
		} catch (error) {
			this.error = message(error);
		}
	}

	async createTag(tag: string): Promise<void> {
		await DocumentsService.createTag(tag);
		await this.refresh();
	}

	async deleteTag(tag: string): Promise<void> {
		await DocumentsService.deleteTag(tag);
		this._tagFilters = this._tagFilters.filter((item) => item !== tag);
		await this.refresh();
	}

	async setTagAssignment(documentIds: string[], tag: string, assigned: boolean): Promise<void> {
		await DocumentsService.setTagAssignment({ documentIds, tag, assigned });
		await this.refresh();
	}

	async autotagDocuments(documentIds: string[]): Promise<ApiDocumentAutotagResult | null> {
		if (this.autotagging || documentIds.length === 0) return null;
		this.autotagging = true;
		this._autotagEntries = [];
		this._autotagSettled = 0;
		this._autotagTotal = documentIds.length;
		this.autotagProgress = { percent: 0, label: 'Autotagging', message: 'Preparing tags' };
		try {
			return await DocumentsService.autotag(documentIds, (progress, entry) => {
				this.autotagProgress = progress;
				if (!entry) return;
				this._autotagSettled += 1;
				this._autotagEntries.push(entry);
				if (this._autotagEntries.length > SYNC_LOG_LIMIT) {
					this._autotagEntries.splice(0, SYNC_LOG_TRIM);
				}
			});
		} finally {
			this.autotagging = false;
			this.autotagProgress = null;
			await this.refresh();
		}
	}

	async autotagGroup(group: string): Promise<ApiDocumentAutotagResult | null> {
		const { ids } = await DocumentsService.listIds({ ...this.listQuery(), group });
		return this.autotagDocuments(ids);
	}

	async setActivation(documentIds: string[] | null, active: boolean): Promise<void> {
		await DocumentsService.setActivation(documentIds ? { documentIds, active } : { active });
		await this.refresh();
	}

	async removeAllDocuments(): Promise<void> {
		await DocumentsService.removeAllDocuments();
		this._selectedIds.clear();
		await this.refresh();
	}

	async ingestFile(file: File) {
		this.progress = { percent: 0, label: 'Ingesting file', message: 'Preparing file' };
		const result = await DocumentsService.ingestFile(
			file,
			(progress) => (this.progress = progress)
		);
		this._selectedIds.add(result.documentId);
		this.progress = null;
		await this.refresh();
		return result;
	}

	async ingestYoutube(url: string) {
		this.progress = {
			percent: 0,
			label: 'Importing YouTube transcript',
			message: 'Reading video details'
		};
		const result = await DocumentsService.ingestYoutube(
			url,
			(progress) => (this.progress = progress)
		);
		this._selectedIds.add(result.documentId);
		this.progress = null;
		await this.refresh();
		return result;
	}

	async ingestText(title: string, text: string) {
		this.progress = { percent: 0, label: 'Embedding text', message: 'Preparing text' };
		const result = await DocumentsService.ingestText(
			title,
			text,
			(progress) => (this.progress = progress)
		);
		this._selectedIds.add(result.documentId);
		this.progress = null;
		await this.refresh();
		return result;
	}

	async removeFolder(id: string, removeDocuments: boolean): Promise<void> {
		const result = await DocumentsService.removeFolder(id, removeDocuments);
		for (const documentId of result.removedDocumentIds) this._selectedIds.delete(documentId);
		await this.refresh();
	}

	async removeDocument(id: string): Promise<void> {
		await DocumentsService.removeDocument(id);
		this._selectedIds.delete(id);
		await this.refresh();
	}

	private listQuery(): ApiDocumentListQuery {
		return {
			mode: this._mode,
			query: this._query,
			sort: this._sort,
			tags: [...this._tagFilters]
		};
	}

	private async fetchList(limitFor: (group: string) => number): Promise<void> {
		const request = ++this.listRequest;
		const query = this.listQuery();
		this.loading = true;
		this.error = null;
		try {
			const [{ folders }, { tags }] = await Promise.all([
				DocumentsService.listFolders(),
				DocumentsService.listTags()
			]);
			const groups = [...folders.map(({ id }) => id), ...LOOSE_DOCUMENT_GROUPS];
			const results = await Promise.all(
				groups.map((group) =>
					DocumentsService.list({ ...query, group, offset: 0, limit: limitFor(group) })
				)
			);
			if (request !== this.listRequest) return;
			this._folders = folders;
			this._tags = tags;
			this._pages = Object.fromEntries(
				groups.map((group, index) => [
					group,
					{ ...results[index], offset: results[index].documents.length }
				])
			);
			this._tagFilters = this._tagFilters.filter((tag) => tags.includes(tag));
			this.pruneSelection();
		} catch (error) {
			if (request === this.listRequest) this.error = message(error);
		} finally {
			if (request === this.listRequest) this.loading = false;
		}
	}

	private pruneSelection(): void {
		const pages = Object.values(this._pages);
		if (this.filtered || pages.some(({ offset, total }) => offset < total)) return;
		const validIds = new Set(pages.flatMap(({ documents }) => documents.map(({ id }) => id)));
		for (const id of this._selectedIds) if (!validIds.has(id)) this._selectedIds.delete(id);
	}

	beginFolderSync(total: number): void {
		this.syncing = true;
		this._syncFiles = [];
		this._syncTotal = total;
		this._syncSettled = 0;
		this.syncFileIndex.clear();
		this.syncProgress = { percent: 0, label: 'Syncing folder', message: 'Scanning folder' };
	}

	reportSyncFile(progress: ApiDocumentSyncFileProgress): void {
		const existingIndex = this.syncFileIndex.get(progress.sourcePath);
		// Entries are written in place: rebuilding the array on every ingest tick is
		// what makes a large sync crawl once the log holds thousands of files.
		if (existingIndex === undefined) {
			this.syncFileIndex.set(progress.sourcePath, this._syncFiles.length);
			this._syncFiles.push(progress);
			this.trimSyncLog();
		} else {
			this._syncFiles[existingIndex] = progress;
		}

		const ingesting = progress.status === 'ingesting';
		if (!ingesting) this._syncSettled += 1;
		this.syncProgress = {
			percent: this.overallSyncPercent(ingesting ? (progress.percent ?? 0) : 0),
			label: progress.label ?? 'Syncing folder',
			message: progress.message ?? progress.sourcePath
		};
	}

	endFolderSync(): void {
		this.syncing = false;
		this.syncProgress = null;
		this._syncTotal = 0;
		this._syncSettled = 0;
	}

	// A per-file percentage restarts at zero once per file, so on a folder of any
	// size the bar has to read as files settled plus how far the current one is.
	private overallSyncPercent(filePercent: number): number {
		if (this._syncTotal <= 0) return filePercent;
		const settled = Math.min(this._syncSettled, this._syncTotal);
		return ((settled + Math.min(Math.max(filePercent, 0), 100) / 100) / this._syncTotal) * 100;
	}

	private trimSyncLog(): void {
		if (this._syncFiles.length <= SYNC_LOG_LIMIT) return;
		this._syncFiles.splice(0, SYNC_LOG_TRIM);
		this.syncFileIndex.clear();
		for (let index = 0; index < this._syncFiles.length; index += 1) {
			this.syncFileIndex.set(this._syncFiles[index].sourcePath, index);
		}
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const documentsStore = new DocumentsStore();
