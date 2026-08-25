import { SvelteSet } from 'svelte/reactivity';
import { DocumentsService } from '$lib/services';
import { DEFAULT_DOCUMENT_SORT } from '$lib/utils';
import type {
	ApiDocumentDirectoryQuery,
	ApiDocumentDirectoryResponse,
	ApiDocumentFolderSyncResponse,
	ApiDocumentIngestProgress,
	ApiDocumentListQuery,
	ApiDocumentSyncFileProgress,
	ApiFolderDocumentCount,
	ApiSyncedFolder,
	DocumentListMode,
	DocumentRow,
	DocumentSortMode
} from '$lib/types';

const PAGE_SIZE = 50;
const MAX_REFRESH_SIZE = 200;
const QUERY_DEBOUNCE_MS = 250;

class DocumentsStore {
	private _documents = $state<DocumentRow[]>([]);
	private _tags = $state<string[]>([]);
	private _folders = $state<ApiSyncedFolder[]>([]);
	private _selectedIds = $state(new SvelteSet<string>());
	private _syncFiles = $state<ApiDocumentSyncFileProgress[]>([]);
	private _total = $state(0);
	private _manualTotal = $state(0);
	private _folderCounts = $state<ApiFolderDocumentCount[]>([]);
	private _query = $state('');
	private _tagFilters = $state<string[]>([]);
	private _mode = $state<DocumentListMode>('all');
	private _sort = $state<DocumentSortMode>(DEFAULT_DOCUMENT_SORT);
	private queryTimer: ReturnType<typeof setTimeout> | undefined;
	private listRequest = 0;
	progress = $state<ApiDocumentIngestProgress | null>(null);
	syncProgress = $state<ApiDocumentIngestProgress | null>(null);
	syncing = $state(false);
	loading = $state(false);
	loadingMore = $state(false);
	error = $state<string | null>(null);

	get documents(): DocumentRow[] {
		return this._documents;
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

	get selectedIds(): ReadonlySet<string> {
		return this._selectedIds;
	}

	get total(): number {
		return this._total;
	}

	get folderCounts(): ApiFolderDocumentCount[] {
		return this._folderCounts;
	}

	get manualTotal(): number {
		return this._manualTotal;
	}

	get hasMore(): boolean {
		return this._documents.length < this._total;
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
		await this.fetchList(PAGE_SIZE);
	}

	async refresh(): Promise<void> {
		await this.fetchList(Math.min(Math.max(this._documents.length, PAGE_SIZE), MAX_REFRESH_SIZE));
	}

	async loadMore(): Promise<void> {
		if (this.loading || this.loadingMore || this.error || !this.hasMore) return;
		const request = ++this.listRequest;
		this.loadingMore = true;
		try {
			const result = await DocumentsService.list({
				...this.listQuery(),
				offset: this._documents.length,
				limit: PAGE_SIZE
			});
			if (request !== this.listRequest) return;
			this._documents = [...this._documents, ...result.documents];
			this._tags = result.tags;
			this._total = result.total;
			this._manualTotal = result.manualTotal;
			this._folderCounts = result.folderCounts;
		} catch (error) {
			if (request === this.listRequest) this.error = message(error);
		} finally {
			this.loadingMore = false;
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
			const result = await DocumentsService.listIds(this.listQuery(), group);
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

	async setActivation(documentIds: string[] | null, active: boolean): Promise<void> {
		await DocumentsService.setActivation(documentIds ? { documentIds, active } : { active });
		await this.refresh();
	}

	async removeAllDocuments(): Promise<void> {
		await DocumentsService.removeAllDocuments();
		this._selectedIds.clear();
		await this.refresh();
	}

	async ingestPath(path: string) {
		this.progress = { percent: 0, label: 'Ingesting file', message: 'Preparing file' };
		const result = await DocumentsService.ingestPath(
			path,
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

	async addFolder(path: string): Promise<ApiDocumentFolderSyncResponse> {
		return this.runFolderSync((onProgress) => DocumentsService.addFolder(path, onProgress));
	}

	async syncFolder(id: string): Promise<ApiDocumentFolderSyncResponse> {
		return this.runFolderSync((onProgress) => DocumentsService.syncFolder(id, onProgress));
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

	browseDirectory(query: ApiDocumentDirectoryQuery = {}): Promise<ApiDocumentDirectoryResponse> {
		return DocumentsService.browseDirectory(query);
	}

	private listQuery(): ApiDocumentListQuery {
		return {
			mode: this._mode,
			query: this._query,
			sort: this._sort,
			tags: [...this._tagFilters]
		};
	}

	private async fetchList(limit: number): Promise<void> {
		const request = ++this.listRequest;
		this.loading = true;
		this.error = null;
		try {
			const [result, folderResult] = await Promise.all([
				DocumentsService.list({ ...this.listQuery(), offset: 0, limit }),
				DocumentsService.listFolders()
			]);
			if (request !== this.listRequest) return;
			this._documents = result.documents;
			this._tags = result.tags;
			this._folders = folderResult.folders;
			this._total = result.total;
			this._manualTotal = result.manualTotal;
			this._folderCounts = result.folderCounts;
			this._tagFilters = this._tagFilters.filter((tag) => result.tags.includes(tag));
			this.pruneSelection();
		} catch (error) {
			if (request === this.listRequest) this.error = message(error);
		} finally {
			if (request === this.listRequest) this.loading = false;
		}
	}

	private pruneSelection(): void {
		if (this.filtered || this.hasMore) return;
		const validIds = new Set(this._documents.map(({ id }) => id));
		for (const id of this._selectedIds) if (!validIds.has(id)) this._selectedIds.delete(id);
	}

	private async runFolderSync(
		operation: (
			onProgress: (progress: ApiDocumentSyncFileProgress) => void
		) => Promise<ApiDocumentFolderSyncResponse>
	): Promise<ApiDocumentFolderSyncResponse> {
		this.syncing = true;
		this._syncFiles = [];
		this.syncProgress = { percent: 0, label: 'Syncing folder', message: 'Scanning for PDFs' };
		try {
			const result = await operation((progress) => {
				const existingIndex = this._syncFiles.findIndex(
					(file) => file.sourcePath === progress.sourcePath
				);
				this._syncFiles =
					existingIndex < 0
						? [...this._syncFiles, progress]
						: this._syncFiles.map((file, index) => (index === existingIndex ? progress : file));
				if (progress.status === 'ingesting') {
					this.syncProgress = {
						percent: progress.percent ?? 0,
						label: progress.label ?? 'Ingesting PDF',
						message: progress.message ?? progress.sourcePath
					};
				}
			});
			await this.refresh();
			return result;
		} finally {
			this.syncing = false;
			this.syncProgress = null;
		}
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const documentsStore = new DocumentsStore();
