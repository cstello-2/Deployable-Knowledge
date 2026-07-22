import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { syncedFiles } from '$lib/server/database/schema';
import { folderWatcherManager } from '$lib/server/documents/folder-watcher';
import { removeDocument } from '$lib/server/documents/remove-document';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params }) => {
	const [syncedFile] = await db
		.select({ folderId: syncedFiles.folderId })
		.from(syncedFiles)
		.where(eq(syncedFiles.documentId, params.id))
		.limit(1);
	if (syncedFile) await folderWatcherManager.waitForIdle(syncedFile.folderId);
	if (!(await removeDocument(params.id))) throw error(404, 'Document not found.');
	return json({ removed: true });
};
