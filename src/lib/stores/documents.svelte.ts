import { SvelteSet } from 'svelte/reactivity';
import { DocumentsService } from '$lib/services';
import type {
	ApiDocumentDirectoryResponse,
	ApiDocumentFolderSyncResponse,
	ApiDocumentIngestProgress,
	ApiDocumentSyncFileProgress,
	ApiSyncedFolder,
	DocumentRow
} from '$lib/types';

class DocumentsStore {
	private _documents = $state<DocumentRow[]>([]);
	private _tags = $state<string[]>([]);
	private _folders = $state<ApiSyncedFolder[]>([]);
	private _selectedIds = $state(new SvelteSet<string>());
	private _syncFiles = $state<ApiDocumentSyncFileProgress[]>([]);
	progress = $state<ApiDocumentIngestProgress | null>(null);
	syncProgress = $state<ApiDocumentIngestProgress | null>(null);
	syncing = $state(false);
	loading = $state(false);
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

	async load(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const [result, folderResult] = await Promise.all([
				DocumentsService.list(),
				DocumentsService.listFolders()
			]);
			this._documents = result.documents;
			this._tags = result.tags;
			this._folders = folderResult.folders;
			const validIds = new Set(result.documents.map(({ id }) => id));
			for (const id of this._selectedIds) if (!validIds.has(id)) this._selectedIds.delete(id);
		} catch (error) {
			this.error = message(error);
		} finally {
			this.loading = false;
		}
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

	async createTag(tag: string): Promise<void> {
		await DocumentsService.createTag(tag);
		await this.load();
	}

	async deleteTag(tag: string): Promise<void> {
		await DocumentsService.deleteTag(tag);
		await this.load();
	}

	async setTagAssignment(documentIds: string[], tag: string, assigned: boolean): Promise<void> {
		await DocumentsService.setTagAssignment({ documentIds, tag, assigned });
		await this.load();
	}

	async ingestPath(path: string) {
		this.progress = { percent: 0, label: 'Ingesting PDF', message: 'Preparing file' };
		const result = await DocumentsService.ingestPath(
			path,
			(progress) => (this.progress = progress)
		);
		this._selectedIds.add(result.documentId);
		this.progress = null;
		await this.load();
		return result;
	}

	async addFolder(path: string): Promise<ApiDocumentFolderSyncResponse> {
		return this.runFolderSync((onProgress) => DocumentsService.addFolder(path, onProgress));
	}

	async syncFolder(id: string): Promise<ApiDocumentFolderSyncResponse> {
		return this.runFolderSync((onProgress) => DocumentsService.syncFolder(id, onProgress));
	}

	async removeFolder(id: string, removeDocuments: boolean): Promise<void> {
		await DocumentsService.removeFolder(id, removeDocuments);
		await this.load();
	}

	async removeDocument(id: string): Promise<void> {
		await DocumentsService.removeDocument(id);
		this._selectedIds.delete(id);
		await this.load();
	}

	browseDirectory(path = ''): Promise<ApiDocumentDirectoryResponse> {
		return DocumentsService.browseDirectory(path);
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
			await this.load();
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
