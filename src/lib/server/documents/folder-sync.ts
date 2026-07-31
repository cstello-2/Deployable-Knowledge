import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import type {
	ApiDocumentIngestProgress,
	ApiDocumentSyncFileProgress,
	ApiDocumentSyncResult
} from '$lib/types';
import { db } from '$lib/server/database/database';
import { documents, syncedFiles } from '$lib/server/database/schema';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import { ingestDocument } from '$lib/server/rag/ingest-document';
import { managedExtensionFor, writeManagedArtifacts } from './managed-artifacts';
import { removeDocument, removeManagedDocumentFile } from './remove-document';
import { handlerForPath, isSyncableFile } from './source-types';

export type SyncProgressCallback = (progress: ApiDocumentSyncFileProgress) => void;

interface SyncFile {
	mtimeMs: number;
	size: number;
	sourcePath: string;
}

async function findFiles(directory: string): Promise<SyncFile[]> {
	const entries = await readdir(directory, { withFileTypes: true, recursive: true });
	const files = entries.filter((entry) => entry.isFile() && isSyncableFile(entry.name));
	const values = await Promise.all(
		files.map(async (file) => {
			const sourcePath = resolve(file.parentPath, file.name);
			const { mtimeMs, size } = await stat(sourcePath);
			return { sourcePath, mtimeMs: Math.trunc(mtimeMs), size };
		})
	);
	return values.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
}

async function managedPathFor(sourcePath: string): Promise<string> {
	const handler = handlerForPath(sourcePath);
	const extension = handler
		? managedExtensionFor(handler, sourcePath)
		: extname(sourcePath).toLowerCase();
	const contentHash = createHash('sha256')
		.update(await readFile(sourcePath))
		.digest('hex');
	return join('documents', `${contentHash.slice(0, 16)}${extension}`);
}

async function ingestManagedCopy(
	sourcePath: string,
	managedPath: string,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
) {
	const handler = handlerForPath(sourcePath);
	if (!handler) throw new Error('Unsupported document type.');

	await writeManagedArtifacts(handler, await readFile(sourcePath), managedPath);
	try {
		const title = basename(sourcePath, extname(sourcePath)).trim() || basename(sourcePath);
		return await ingestDocument(
			{ filePath: managedPath, title, sourceType: handler.type },
			onProgress
		);
	} catch (error) {
		await removeManagedDocumentFile(managedPath);
		throw error;
	}
}

export async function syncFolder(
	folderId: string,
	onProgress?: SyncProgressCallback,
	shouldStop?: () => boolean
): Promise<ApiDocumentSyncResult> {
	const folder = await SyncedFoldersRepository.find(folderId);
	if (!folder) throw new Error(`Synced folder not found: ${folderId}`);

	const sourceFiles = await findFiles(resolve(folder.path));
	const trackedFiles = await SyncedFoldersRepository.syncedFiles(folderId);
	const trackedByPath = new Map(trackedFiles.map((file) => [file.sourcePath, file]));
	const currentPaths = new Set(sourceFiles.map((file) => file.sourcePath));
	const result: ApiDocumentSyncResult = {
		added: 0,
		updated: 0,
		removed: 0,
		unchanged: 0,
		failed: 0
	};

	for (const file of sourceFiles) {
		if (!trackedByPath.get(file.sourcePath)?.ignored) {
			onProgress?.({ sourcePath: file.sourcePath, status: 'queued' });
		}
	}

	await mkdir('documents', { recursive: true });

	for (const file of sourceFiles) {
		if (shouldStop?.()) return result;
		const tracked = trackedByPath.get(file.sourcePath);
		if (tracked?.ignored) continue;

		if (tracked?.documentId && tracked.mtimeMs === file.mtimeMs && tracked.size === file.size) {
			result.unchanged += 1;
			onProgress?.({ sourcePath: file.sourcePath, status: 'unchanged' });
			continue;
		}

		let managedPath = tracked?.managedPath ?? '';
		let ingestedDocumentId: string | null = null;
		let createdDocument = false;

		try {
			onProgress?.({ sourcePath: file.sourcePath, status: 'ingesting' });

			handlerForPath(file.sourcePath)?.validateFile?.({ path: file.sourcePath, size: file.size });

			managedPath = await managedPathFor(file.sourcePath);

			const [existingDocument] = await db
				.select({ id: documents.id })
				.from(documents)
				.where(eq(documents.sourcePath, managedPath))
				.limit(1);

			const [existingOwner] = existingDocument
				? await db
						.select({ folderId: syncedFiles.folderId, sourcePath: syncedFiles.sourcePath })
						.from(syncedFiles)
						.where(eq(syncedFiles.documentId, existingDocument.id))
						.limit(1)
				: [];

			if (existingOwner && existingOwner.sourcePath !== file.sourcePath) {
				const renamedInThisFolder =
					existingOwner.folderId === folderId && !currentPaths.has(existingOwner.sourcePath);
				if (renamedInThisFolder) {
					await db.delete(syncedFiles).where(eq(syncedFiles.sourcePath, existingOwner.sourcePath));
					currentPaths.add(existingOwner.sourcePath);
				} else {
					if (tracked?.documentId) {
						await removeDocument(tracked.documentId, { syncedFileDisposition: 'remove' });
					}
					result.unchanged += 1;
					onProgress?.({ sourcePath: file.sourcePath, status: 'unchanged' });
					continue;
				}
			}

			if (existingDocument) {
				ingestedDocumentId = existingDocument.id;
			} else {
				ingestedDocumentId = (
					await ingestManagedCopy(file.sourcePath, managedPath, (progress) => {
						onProgress?.({ sourcePath: file.sourcePath, status: 'ingesting', ...progress });
					})
				).documentId;
				createdDocument = true;
			}

			await db
				.insert(syncedFiles)
				.values({
					sourcePath: file.sourcePath,
					folderId,
					managedPath,
					documentId: ingestedDocumentId,
					mtimeMs: file.mtimeMs,
					size: file.size,
					ignored: false
				})
				.onConflictDoUpdate({
					target: syncedFiles.sourcePath,
					set: {
						folderId,
						managedPath,
						documentId: ingestedDocumentId,
						mtimeMs: file.mtimeMs,
						size: file.size,
						ignored: false
					}
				});

			if (tracked?.documentId && tracked.documentId !== ingestedDocumentId) {
				await removeDocument(tracked.documentId, { syncedFileDisposition: 'remove' });
			}

			const status = tracked ? 'updated' : 'added';
			result[status] += 1;
			onProgress?.({ sourcePath: file.sourcePath, status });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			result.failed += 1;
			onProgress?.({ sourcePath: file.sourcePath, status: 'failed', message });
			console.error(`[Folder Sync] ${file.sourcePath}: ${message}`);

			if (!tracked && createdDocument) {
				try {
					if (ingestedDocumentId) {
						await removeDocument(ingestedDocumentId, { syncedFileDisposition: 'remove' });
					} else {
						await removeManagedDocumentFile(managedPath);
					}
				} catch (cleanupError) {
					console.error(`[Folder Sync] Cleanup failed for ${file.sourcePath}:`, cleanupError);
				}
			}
		}
	}

	if (shouldStop?.()) return result;

	for (const tracked of trackedFiles) {
		if (currentPaths.has(tracked.sourcePath)) continue;
		if (tracked.documentId) {
			await removeDocument(tracked.documentId, { syncedFileDisposition: 'remove' });
		} else {
			await db.delete(syncedFiles).where(eq(syncedFiles.sourcePath, tracked.sourcePath));
			await removeManagedDocumentFile(tracked.managedPath);
		}
		result.removed += 1;
		onProgress?.({ sourcePath: tracked.sourcePath, status: 'removed' });
	}

	await SyncedFoldersRepository.setLastError(
		folderId,
		result.failed ? `${result.failed} file(s) failed to sync.` : null
	);
	return result;
}
