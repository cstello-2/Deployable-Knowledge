import { unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import { documents, syncedFiles } from '$lib/server/database/schema';
import { invalidateKnowledgeGraphCache } from '$lib/server/knowledge-graph/graph-index';
import { previewPathFor } from './managed-artifacts';

export type SyncedFileDisposition = 'ignore' | 'remove';

interface RemoveDocumentOptions {
	syncedFileDisposition?: SyncedFileDisposition;
}

export function containsPath(parent: string, child: string): boolean {
	const path = relative(parent, child);
	return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function isManagedDocumentPath(filePath: string): boolean {
	const root = resolve('documents');
	const path = resolve(filePath);
	return path !== root && containsPath(root, path);
}

async function unlinkIfPresent(filePath: string): Promise<void> {
	try {
		await unlink(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
		throw error;
	}
}

export async function removeManagedDocumentFile(filePath: string): Promise<void> {
	if (!isManagedDocumentPath(filePath)) return;

	await unlinkIfPresent(filePath);
	await unlinkIfPresent(previewPathFor(filePath));
}

export async function removeDocument(
	documentId: string,
	options: RemoveDocumentOptions = {}
): Promise<boolean> {
	const disposition = options.syncedFileDisposition ?? 'ignore';
	const [document] = await db
		.select({ sourcePath: documents.sourcePath })
		.from(documents)
		.where(eq(documents.id, documentId))
		.limit(1);
	const [syncedFile] = await db
		.select({ managedPath: syncedFiles.managedPath })
		.from(syncedFiles)
		.where(eq(syncedFiles.documentId, documentId))
		.limit(1);

	await db.transaction(async (transaction) => {
		if (disposition === 'remove') {
			await transaction.delete(syncedFiles).where(eq(syncedFiles.documentId, documentId));
		} else {
			await transaction
				.update(syncedFiles)
				.set({ documentId: null, ignored: true })
				.where(eq(syncedFiles.documentId, documentId));
		}

		await transaction.delete(documents).where(eq(documents.id, documentId));
	});

	const managedPath = syncedFile?.managedPath ?? document?.sourcePath;
	if (managedPath) await removeManagedDocumentFile(managedPath);
	if (document || syncedFile) invalidateKnowledgeGraphCache();
	return Boolean(document);
}
