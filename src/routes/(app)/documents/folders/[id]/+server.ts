import { error, json } from '@sveltejs/kit';
import { removeDocument, removeManagedDocumentFile } from '$lib/server/documents/remove-document';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, url }) => {
	const folder = await SyncedFoldersRepository.find(params.id);
	if (!folder) throw error(404, 'Synced folder not found.');
	const removeDocuments = url.searchParams.get('removeDocuments') === 'true';

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
