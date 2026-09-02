import { SvelteMap } from 'svelte/reactivity';
import { browser } from '$app/environment';
import { isIngestableFileName } from '$lib/constants/ingest-formats';
import { DocumentsService } from '$lib/services';
import { documentsStore } from '$lib/stores/documents.svelte';
import type { ApiDocumentSyncResult, ApiSyncFileStat } from '$lib/types';
import { supportsFileObserver, supportsFolderSync } from '$lib/utils/fs-access';
import { deleteFolder, listFolders, putFolder } from './handle-store';
import { matchRenames } from './rename-plan';
import { collectFiles, type WalkedFile } from './walk';

export type FolderSyncStatus =
	| 'unsupported'
	| 'handle-missing'
	| 'permission-needed'
	| 'syncing'
	| 'watching'
	| 'idle'
	| 'error';

const OBSERVER_DEBOUNCE_MS = 2000;
const RESCAN_INTERVAL_MS = 60_000;

class FolderSyncEngine {
	private handles = new Map<string, FileSystemDirectoryHandle>();
	private observers = new Map<string, FileSystemObserver>();
	private rescanTimers = new Map<string, ReturnType<typeof setInterval>>();
	private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private running = new Set<string>();
	private rerun = new Set<string>();
	private initialized = false;
	private _statuses = new SvelteMap<string, FolderSyncStatus>();

	get statuses(): ReadonlyMap<string, FolderSyncStatus> {
		return this._statuses;
	}

	get supported(): boolean {
		return supportsFolderSync();
	}

	async initialize(): Promise<void> {
		if (!browser || this.initialized) return;
		this.initialized = true;
		if (!this.supported) {
			for (const folder of documentsStore.folders) {
				this._statuses.set(folder.id, 'unsupported');
			}
			return;
		}

		let stored;
		try {
			stored = await listFolders();
		} catch {
			for (const folder of documentsStore.folders) {
				this._statuses.set(folder.id, 'handle-missing');
			}
			return;
		}

		const serverIds = new Set(documentsStore.folders.map((folder) => folder.id));
		for (const record of stored) {
			if (!serverIds.has(record.id)) {
				void deleteFolder(record.id).catch(() => {});
				continue;
			}
			this.handles.set(record.id, record.handle);
		}

		for (const folder of documentsStore.folders) {
			if (!this.handles.has(folder.id)) {
				this._statuses.set(folder.id, 'handle-missing');
				continue;
			}
			void this.connect(folder.id);
		}
	}

	async addFolder(handle: FileSystemDirectoryHandle): Promise<ApiDocumentSyncResult | null> {
		const id = crypto.randomUUID();
		await putFolder({ id, name: handle.name, handle });
		await DocumentsService.registerFolder(id, handle.name);
		this.handles.set(id, handle);
		const result = await this.runSync(id);
		this.startWatching(id);
		await documentsStore.refresh();
		return result;
	}

	async syncFolder(id: string): Promise<ApiDocumentSyncResult | null> {
		if (!this.handles.has(id)) {
			this._statuses.set(id, 'handle-missing');
			return null;
		}
		if (!(await this.ensurePermission(id, true))) return null;
		const result = await this.runSync(id);
		if (!this.observers.has(id) && !this.rescanTimers.has(id)) this.startWatching(id);
		return result;
	}

	async reconnect(id: string, replacement?: FileSystemDirectoryHandle): Promise<void> {
		if (replacement) {
			const name = documentsStore.folders.find((folder) => folder.id === id)?.name;
			await putFolder({ id, name: name ?? replacement.name, handle: replacement });
			this.handles.set(id, replacement);
		}
		await this.connect(id);
	}

	async forget(id: string): Promise<void> {
		this.stopWatching(id);
		this.handles.delete(id);
		this._statuses.delete(id);
		await deleteFolder(id).catch(() => {});
	}

	dispose(): void {
		for (const id of [...this.observers.keys(), ...this.rescanTimers.keys()]) {
			this.stopWatching(id);
		}
	}

	private async connect(id: string): Promise<void> {
		if (!(await this.ensurePermission(id, false))) return;
		await this.runSync(id);
		this.startWatching(id);
		await documentsStore.refresh();
	}

	private async ensurePermission(id: string, request: boolean): Promise<boolean> {
		const handle = this.handles.get(id);
		if (!handle) {
			this._statuses.set(id, 'handle-missing');
			return false;
		}
		try {
			let state = (await handle.queryPermission?.({ mode: 'read' })) ?? 'granted';
			if (state === 'prompt' && request) {
				state = (await handle.requestPermission?.({ mode: 'read' })) ?? 'denied';
			}
			if (state === 'granted') return true;
			this._statuses.set(id, state === 'denied' ? 'handle-missing' : 'permission-needed');
			return false;
		} catch {
			this._statuses.set(id, 'error');
			return false;
		}
	}

	async requestAccess(id: string): Promise<void> {
		if (await this.ensurePermission(id, true)) {
			await this.runSync(id);
			this.startWatching(id);
			await documentsStore.refresh();
		}
	}

	async retryFailed(id: string): Promise<ApiDocumentSyncResult | null> {
		if (!this.handles.has(id)) {
			this._statuses.set(id, 'handle-missing');
			return null;
		}
		if (!(await this.ensurePermission(id, true))) return null;
		await DocumentsService.retryFolderFailures(id);
		const result = await this.runSync(id);
		await documentsStore.refresh();
		return result;
	}

	private async runSync(id: string): Promise<ApiDocumentSyncResult | null> {
		if (this.running.has(id)) {
			this.rerun.add(id);
			return null;
		}
		const handle = this.handles.get(id);
		if (!handle) return null;

		this.running.add(id);
		this._statuses.set(id, 'syncing');
		const result: ApiDocumentSyncResult = {
			added: 0,
			removed: 0,
			unchanged: 0,
			failed: 0,
			heldBack: 0
		};

		try {
			const walked = await collectFiles(handle, isIngestableFileName);
			const byPath = new Map<string, WalkedFile>(walked.map((entry) => [entry.path, entry]));
			const stats: ApiSyncFileStat[] = walked.map(({ path, file }) => ({
				path,
				lastModified: file.lastModified,
				size: file.size
			}));

			const plan = await DocumentsService.reconcileFolder(id, stats);
			result.unchanged = plan.unchanged;
			result.heldBack = plan.failed;

			if (!plan.upload.length && !plan.stale.length) {
				this._statuses.set(id, this.observers.has(id) ? 'watching' : 'idle');
				return result;
			}

			documentsStore.beginFolderSync();
			const { replaces, stale } = matchRenames(plan.upload, plan.stale);

			for (const entry of plan.upload) {
				documentsStore.reportSyncFile({ sourcePath: entry.path, status: 'queued' });
			}

			for (const entry of plan.upload) {
				const walkedFile = byPath.get(entry.path);
				if (!walkedFile) continue;
				try {
					documentsStore.reportSyncFile({ sourcePath: entry.path, status: 'ingesting' });
					await DocumentsService.uploadFolderFile(
						id,
						{ ...entry, replacesPath: replaces.get(entry.path) },
						walkedFile.file,
						(progress) =>
							documentsStore.reportSyncFile({
								sourcePath: entry.path,
								status: 'ingesting',
								...progress
							})
					);
					result.added += 1;
					documentsStore.reportSyncFile({ sourcePath: entry.path, status: 'added' });
				} catch (cause) {
					result.failed += 1;
					documentsStore.reportSyncFile({
						sourcePath: entry.path,
						status: 'failed',
						message: cause instanceof Error ? cause.message : String(cause)
					});
				}
			}

			if (stale.length) {
				const removedResult = await DocumentsService.deleteFolderFiles(id, stale);
				result.removed = removedResult.removed;
				for (const documentId of removedResult.removedDocumentIds) {
					documentsStore.setSelection([documentId], false);
				}
				for (const path of stale) {
					documentsStore.reportSyncFile({ sourcePath: path, status: 'removed' });
				}
			}

			this._statuses.set(id, this.observers.has(id) ? 'watching' : 'idle');
			return result;
		} catch (cause) {
			console.error(`[Folder Sync] ${id}:`, cause);
			this._statuses.set(id, 'error');
			return result;
		} finally {
			this.running.delete(id);
			documentsStore.endFolderSync();
			if (this.rerun.delete(id)) void this.runSync(id).then(() => documentsStore.refresh());
		}
	}

	private startWatching(id: string): void {
		const handle = this.handles.get(id);
		if (!handle) return;
		this.stopWatching(id);

		if (supportsFileObserver()) {
			const observer = new window.FileSystemObserver!(() => this.scheduleSync(id));
			void observer.observe(handle, { recursive: true }).catch(() => {
				this.observers.delete(id);
				this.startRescanFallback(id);
			});
			this.observers.set(id, observer);
			this._statuses.set(id, 'watching');
			return;
		}
		this.startRescanFallback(id);
	}

	private startRescanFallback(id: string): void {
		this.rescanTimers.set(
			id,
			setInterval(() => this.scheduleSync(id), RESCAN_INTERVAL_MS)
		);
		this._statuses.set(id, 'idle');
	}

	private scheduleSync(id: string): void {
		clearTimeout(this.debounceTimers.get(id));
		this.debounceTimers.set(
			id,
			setTimeout(() => {
				this.debounceTimers.delete(id);
				void this.runSync(id).then((result) => {
					if (result && result.added + result.removed > 0) {
						void documentsStore.refresh();
					}
				});
			}, OBSERVER_DEBOUNCE_MS)
		);
	}

	private stopWatching(id: string): void {
		this.observers.get(id)?.disconnect();
		this.observers.delete(id);
		clearInterval(this.rescanTimers.get(id));
		this.rescanTimers.delete(id);
		clearTimeout(this.debounceTimers.get(id));
		this.debounceTimers.delete(id);
	}
}

export const folderSyncEngine = new FolderSyncEngine();
