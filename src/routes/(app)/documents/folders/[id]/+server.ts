import { error, json } from '@sveltejs/kit';
import { streamFolderSync } from '$lib/server/documents/folder-sync-response';
import { folderWatcherManager } from '$lib/server/documents/folder-watcher';
import { removeDocument, removeManagedDocumentFile } from '$lib/server/documents/remove-document';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

async function getFolder(id: string) {
	const folder = await SyncedFoldersRepository.find(id);
	if (!folder) throw error(404, 'Synced folder not found.');
	return folder;
}

export const POST: RequestHandler = async ({ params }) => {
	return streamFolderSync(await getFolder(params.id), false);
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const folder = await getFolder(params.id);
	const removeDocuments = url.searchParams.get('removeDocuments') === 'true';
	await folderWatcherManager.stop(folder.id);

	const removedDocumentIds: string[] = [];
	if (removeDocuments) {
		for (const file of await SyncedFoldersRepository.syncedFiles(folder.id)) {
			if (file.documentId) {
				await removeDocument(file.documentId, { syncedFileDisposition: 'remove' });
				removedDocumentIds.push(file.documentId);
			} else {
				await removeManagedDocumentFile(file.managedPath);
			}
		}
	}

	await SyncedFoldersRepository.delete(folder.id);
	return json({ removed: true, removedDocumentIds });
};
