import { resolve } from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import type { ApiDocumentSyncFileProgress, ApiDocumentSyncResult, SyncedFolder } from '$lib/types';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import { isSyncableFile } from '$lib/server/documents/source-types';
import { syncFolder, type SyncProgressCallback } from './folder-sync';

type Folder = Pick<SyncedFolder, 'id' | 'path'>;

interface WatchedFolder {
	closed: boolean;
	listeners: Set<SyncProgressCallback>;
	progress: Map<string, ApiDocumentSyncFileProgress>;
	rerun: boolean;
	running?: Promise<ApiDocumentSyncResult | undefined>;
	timer?: ReturnType<typeof setTimeout>;
	watcher: FSWatcher;
}

const serverState = globalThis as typeof globalThis & {
	deployableKnowledgeFolderWatchers?: Map<string, WatchedFolder>;
};
const folders = (serverState.deployableKnowledgeFolderWatchers ??= new Map());

async function recordError(folderId: string, error: unknown): Promise<void> {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[Folder Watcher] ${folderId}: ${message}`);
	await SyncedFoldersRepository.setLastError(folderId, message);
}

async function run(folderId: string): Promise<ApiDocumentSyncResult | undefined> {
	const state = folders.get(folderId);
	if (!state || state.closed) return;
	if (state.running) return state.running;

	state.running = (async () => {
		let result: ApiDocumentSyncResult | undefined;
		do {
			state.rerun = false;
			state.progress.clear();
			try {
				result = await syncFolder(
					folderId,
					(progress) => {
						state.progress.set(progress.sourcePath, progress);
						for (const listener of state.listeners) listener(progress);
					},
					() => state.closed
				);
			} catch (error) {
				await recordError(folderId, error);
			}
		} while (state.rerun && !state.closed);
		return result;
	})();

	try {
		return await state.running;
	} finally {
		state.running = undefined;
	}
}

export const folderWatcherManager = {
	async start(folder: Folder): Promise<void> {
		await this.stop(folder.id);

		const watcher = watch(resolve(folder.path), {
			ignoreInitial: true,
			atomic: true,
			awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 250 },
			ignored: (path, stats) => Boolean(stats?.isFile() && !isSyncableFile(path))
		});
		const state: WatchedFolder = {
			watcher,
			rerun: false,
			closed: false,
			listeners: new Set(),
			progress: new Map()
		};
		folders.set(folder.id, state);

		watcher.on('all', (event, path) => {
			if (
				event === 'addDir' ||
				event === 'unlinkDir' ||
				(['add', 'change', 'unlink'].includes(event) && isSyncableFile(path))
			) {
				this.scheduleSync(folder.id);
			}
		});
		watcher.on('error', (error) => void recordError(folder.id, error));

		try {
			await new Promise<void>((ready, reject) => {
				watcher.once('ready', ready);
				watcher.once('error', reject);
			});
		} catch (error) {
			folders.delete(folder.id);
			await watcher.close();
			throw error;
		}
	},

	async startRegistered(): Promise<void> {
		for (const folder of await SyncedFoldersRepository.list()) {
			try {
				await this.start(folder);
			} catch (error) {
				await recordError(folder.id, error);
			}
		}
	},

	scheduleSync(folderId: string): void {
		const state = folders.get(folderId);
		if (!state || state.closed) return;
		if (state.running) {
			state.rerun = true;
			return;
		}
		clearTimeout(state.timer);
		state.timer = setTimeout(() => void run(folderId), 2000);
	},

	async syncNow(folderId: string, onProgress?: SyncProgressCallback) {
		const state = folders.get(folderId);
		if (!state || state.closed) return;

		clearTimeout(state.timer);
		if (onProgress) {
			state.listeners.add(onProgress);
			if (state.running) {
				for (const progress of state.progress.values()) onProgress(progress);
			}
		}
		try {
			return await run(folderId);
		} finally {
			if (onProgress) state.listeners.delete(onProgress);
		}
	},

	async stop(folderId: string): Promise<void> {
		const state = folders.get(folderId);
		if (!state) return;
		state.closed = true;
		clearTimeout(state.timer);
		await state.watcher.close();
		await state.running;
		if (folders.get(folderId) === state) folders.delete(folderId);
	},

	async waitForIdle(folderId: string): Promise<void> {
		await folders.get(folderId)?.running;
	},

	async stopAll(): Promise<void> {
		await Promise.all([...folders.keys()].map((id) => this.stop(id)));
	},

	isWatching(folderId: string): boolean {
		return folders.has(folderId);
	}
};
