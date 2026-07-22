import type { ApiDocumentFolderSyncEvent, SyncedFolder } from '$lib/types';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import { folderWatcherManager } from './folder-watcher';

type Folder = Pick<SyncedFolder, 'id' | 'path'>;

export function streamFolderSync(folder: Folder, created: boolean): Response {
	const encoder = new TextEncoder();
	let connected = true;

	const stream = new ReadableStream({
		async start(controller) {
			const send = (event: ApiDocumentFolderSyncEvent) => {
				if (!connected) return;
				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				} catch {
					connected = false;
				}
			};

			send({ type: 'folder', folderId: folder.id, created });
			try {
				if (!folderWatcherManager.isWatching(folder.id)) {
					await folderWatcherManager.start(folder);
				}
				const result = await folderWatcherManager.syncNow(folder.id, (progress) => {
					send({ type: 'file', ...progress });
				});
				send({ type: 'done', result });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				await SyncedFoldersRepository.setLastError(folder.id, message);
				send({ type: 'error', message });
			} finally {
				if (connected) controller.close();
			}
		},
		cancel() {
			connected = false;
		}
	});

	return new Response(stream, {
		status: created ? 201 : 200,
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'X-Accel-Buffering': 'no'
		}
	});
}
