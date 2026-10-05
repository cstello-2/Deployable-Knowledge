import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { LOOSE_DOCUMENT_GROUPS, type LooseDocumentGroup } from '$lib/constants';
import { DocumentsService } from '$lib/services';
import { DEFAULT_DOCUMENT_SORT } from '$lib/utils';
import type {
	ApiDocumentAutotagEntry,
	ApiDocumentAutotagResult,
	ApiDocumentIngestProgress,
	ApiDocumentIngestResult,
	ApiDocumentListQuery,
	ApiDocumentListResponse,
	ApiSyncedFolder,
	DocumentListMode,
	DocumentSortMode,
	PendingDocument
} from '$lib/types';

const PAGE_SIZE = 50;
const MAX_REFRESH_SIZE = 200;
const QUERY_DEBOUNCE_MS = 250;
// The per-document list is a running log of an autotag run, not a record of it.
// Keeping every entry of a several-thousand document run would put that many rows
// in the dialog and grow the work of each update with the size of the corpus, so
// old entries are dropped in blocks once the log is full.
const AUTOTAG_LOG_LIMIT = 200;
const AUTOTAG_LOG_TRIM = 100;

interface DocumentGroupPage extends ApiDocumentListResponse {
	// Rows consumed from the server. Runs ahead of `documents.length` when an ingest
	// shifts shown rows into the next page and the repeats are dropped.
	offset: number;
}

type IngestRequest = (
	onProgress: (progress: ApiDocumentIngestProgress) => void
) => Promise<ApiDocumentIngestResult>;

class DocumentsStore {
	private _pages = $state.raw<Record<string, DocumentGroupPage>>({});
	private _loadingGroups = new SvelteSet<string>();
	private _tags = $state<string[]>([]);
	private _folders = $state<ApiSyncedFolder[]>([]);
	private _selectedIds = $state(new SvelteSet<string>());
	// Progress lives apart from the queue so a per-chunk tick only touches the row
	// being ingested, not every queued row of a several-thousand file sync.
	private _pending = $state.raw<PendingDocument[]>([]);
	private _ingestProgress = new SvelteMap<string, ApiDocumentIngestProgress>();
	private _query = $state('');
	private _tagFilters = $state<string[]>([]);
	private _mode = $state<DocumentListMode>('all');
	private _sort = $state<DocumentSortMode>(DEFAULT_DOCUMENT_SORT);
	private _autotagEntries = $state<ApiDocumentAutotagEntry[]>([]);
	private _autotagSettled = $state(0);
	private _autotagTotal = $state(0);
	private queryTimer: ReturnType<typeof setTimeout> | undefined;
	private listRequest = 0;
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

	/** Documents queued or mid-ingest, shown in their group until the stored row replaces them. */
	get pendingDocuments(): PendingDocument[] {
		return this._pending;
	}

	/** Keyed by pending document key; absent while the document is still queued. */
	get ingestProgress(): ReadonlyMap<string, ApiDocumentIngestProgress> {
		return this._ingestProgress;
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
				if (this._autotagEntries.length > AUTOTAG_LOG_LIMIT) {
					this._autotagEntries.splice(0, AUTOTAG_LOG_TRIM);
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

	/** Queues every file up front so the whole batch is listed, then ingests them in order. */
	async ingestFiles(files: File[], onFailure: (error: unknown) => void): Promise<number> {
		const entries = this.enqueueDocuments(
			'individual',
			files.map(({ name }) => name)
		);
		let succeeded = 0;
		try {
			for (const [index, file] of files.entries()) {
				try {
					const result = await this.ingestPending(entries[index], (onProgress) =>
						DocumentsService.ingestFile(file, onProgress)
					);
					this._selectedIds.add(result.documentId);
					succeeded += 1;
				} catch (error) {
					onFailure(error);
				}
			}
		} finally {
			this.dropPending(entries);
		}
		return succeeded;
	}

	ingestYoutube(url: string): Promise<ApiDocumentIngestResult> {
		return this.ingestSingle('manual', url, (onProgress) =>
			DocumentsService.ingestYoutube(url, onProgress)
		);
	}

	ingestText(title: string, text: string): Promise<ApiDocumentIngestResult> {
		return this.ingestSingle('manual', title, (onProgress) =>
			DocumentsService.ingestText(title, text, onProgress)
		);
	}

	enqueueDocuments(group: string, titles: string[]): PendingDocument[] {
		const entries = titles.map((title) => ({ key: crypto.randomUUID(), group, title }));
		if (entries.length) this._pending = [...this._pending, ...entries];
		return entries;
	}

	async ingestPending(
		entry: PendingDocument,
		ingest: IngestRequest
	): Promise<ApiDocumentIngestResult> {
		this._ingestProgress.set(entry.key, { percent: 0, label: 'Ingesting', message: 'Starting' });
		try {
			const result = await ingest((progress) => this._ingestProgress.set(entry.key, progress));
			// Dropping the entry only after the refresh hands the row straight to the
			// stored document instead of blinking out between the two.
			await this.refresh();
			return result;
		} finally {
			this.dropPending([entry]);
		}
	}

	dropPending(entries: PendingDocument[]): void {
		const keys = new Set(entries.map(({ key }) => key));
		for (const key of keys) this._ingestProgress.delete(key);
		if (!this._pending.some(({ key }) => keys.has(key))) return;
		this._pending = this._pending.filter(({ key }) => !keys.has(key));
	}

	private async ingestSingle(
		group: LooseDocumentGroup,
		title: string,
		ingest: IngestRequest
	): Promise<ApiDocumentIngestResult> {
		const [entry] = this.enqueueDocuments(group, [title]);
		const result = await this.ingestPending(entry, ingest);
		this._selectedIds.add(result.documentId);
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
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const documentsStore = new DocumentsStore();
