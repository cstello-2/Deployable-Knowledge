import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import type { ApiDocumentIngestProgress, ApiDocumentIngestResult } from '$lib/types';
import { db } from '$lib/server/database/database';
import { documents, syncedFiles, type SyncedFile } from '$lib/server/database/schema';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import { ingestDocument } from '$lib/server/rag/ingest-document';
import { managedPathForHash, titleFor } from './ingest-file';
import { managedExtensionFor, writeManagedArtifacts } from './managed-artifacts';
import { removeDocument, removeManagedDocumentFile } from './remove-document';
import { handlerForPath } from './source-types';

export interface SyncFileStats {
	lastModified: number;
	size: number;
}

export interface UploadedSyncFile extends SyncFileStats {
	relativePath: string;
	replacesPath?: string;
}

export async function syncUploadedFile(
	folderId: string,
	file: UploadedSyncFile,
	buffer: Buffer,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentIngestResult> {
	const folder = await SyncedFoldersRepository.find(folderId);
	if (!folder) throw new Error(`Synced folder not found: ${folderId}`);

	try {
		const result = await ingestSyncedFile(folderId, file, buffer, onProgress);
		// Every ingested file would otherwise rewrite this column, and on a large
		// corpus that is thousands of pointless writes behind the sync.
		if (folder.lastError !== null) await SyncedFoldersRepository.setLastError(folderId, null);
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await markMalformed(folderId, file, message);
		if (folder.lastError !== message) {
			await SyncedFoldersRepository.setLastError(folderId, message).catch(() => {});
		}
		throw error;
	}
}

/**
 * Parks a file that could not be ingested so folder syncs stop retrying it on
 * every restart and reconnect. It stays parked until the bytes on disk change or
 * the user retries the folder.
 */
export async function markMalformed(
	folderId: string,
	file: UploadedSyncFile,
	message: string
): Promise<void> {
	console.error(`[Folder Sync] Marked malformed: ${file.relativePath} — ${message}`);
	await SyncedFoldersRepository.markFile(folderId, file, 'malformed', message).catch((error) =>
		console.error(`[Folder Sync] Could not mark ${file.relativePath} malformed:`, error)
	);
}

async function ingestSyncedFile(
	folderId: string,
	file: UploadedSyncFile,
	buffer: Buffer,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentIngestResult> {
	const handler = handlerForPath(file.relativePath);
	if (!handler) throw new Error('Unsupported document type.');
	handler.validateFile?.({ path: file.relativePath, size: buffer.byteLength });
	handler.validateBuffer?.(buffer);

	const tracked = await SyncedFoldersRepository.findFile(folderId, file.relativePath);
	if (tracked && isSettledSyncFile(tracked, file)) {
		return unchangedResult(tracked.documentId, file.relativePath);
	}

	await mkdir('documents', { recursive: true });
	const contentHash = createHash('sha256').update(buffer).digest('hex');
	const managedPath = managedPathForHash(
		contentHash,
		managedExtensionFor(handler, file.relativePath)
	);

	const [existingDocument] = await db
		.select({ id: documents.id })
		.from(documents)
		.where(eq(documents.sourcePath, managedPath))
		.limit(1);

	const [existingOwner] = existingDocument
		? await db
				.select({ folderId: syncedFiles.folderId, relativePath: syncedFiles.relativePath })
				.from(syncedFiles)
				.where(eq(syncedFiles.documentId, existingDocument.id))
				.limit(1)
		: [];

	if (
		existingOwner &&
		!(existingOwner.folderId === folderId && existingOwner.relativePath === file.relativePath)
	) {
		const renamed =
			existingOwner.folderId === folderId && existingOwner.relativePath === file.replacesPath;
		if (renamed) {
			await SyncedFoldersRepository.deleteFile(folderId, existingOwner.relativePath);
		} else {
			if (tracked?.documentId) {
				await removeDocument(tracked.documentId, { syncedFileDisposition: 'remove' });
			}
			// The bytes already live under another path, so this one owns nothing.
			// Recording it as a duplicate is what keeps every later sync from
			// re-uploading the file just because no row explained it away.
			await SyncedFoldersRepository.markFile(
				folderId,
				file,
				'duplicate',
				existingOwner.relativePath
			);
			return unchangedResult(existingDocument?.id ?? null, file.relativePath);
		}
	}

	let ingestedDocumentId: string;
	let createdDocument = false;
	try {
		if (existingDocument) {
			ingestedDocumentId = existingDocument.id;
		} else {
			if (handler.convert) {
				onProgress?.({ percent: 0, label: handler.progressLabel, message: handler.startMessage });
			}
			await writeManagedArtifacts(handler, buffer, managedPath);
			try {
				ingestedDocumentId = (
					await ingestDocument(
						{
							filePath: managedPath,
							title: titleFor(file.relativePath),
							sourceType: handler.type
						},
						onProgress
					)
				).documentId;
				createdDocument = true;
			} catch (error) {
				await removeManagedDocumentFile(managedPath);
				throw error;
			}
		}

		const row = {
			managedPath,
			documentId: ingestedDocumentId,
			lastModified: file.lastModified,
			size: file.size,
			state: 'synced' as const,
			message: null
		};
		await db
			.insert(syncedFiles)
			.values({ folderId, relativePath: file.relativePath, ...row })
			.onConflictDoUpdate({
				target: [syncedFiles.folderId, syncedFiles.relativePath],
				set: row
			});

		if (tracked?.documentId && tracked.documentId !== ingestedDocumentId) {
			await removeDocument(tracked.documentId, { syncedFileDisposition: 'remove' });
		}

		return {
			documentId: ingestedDocumentId,
			title: titleFor(file.relativePath),
			sourcePath: managedPath,
			pageCount: 0,
			chunkCount: 0
		};
	} catch (error) {
		if (!tracked && createdDocument) {
			await removeDocument(ingestedDocumentId!, { syncedFileDisposition: 'remove' }).catch(
				(cleanupError) =>
					console.error(`[Folder Sync] Cleanup failed for ${file.relativePath}:`, cleanupError)
			);
		}
		throw error;
	}
}

export async function removeSyncedFiles(
	folderId: string,
	paths: string[]
): Promise<{ removed: number; removedDocumentIds: string[] }> {
	const removedDocumentIds: string[] = [];
	let removed = 0;
	for (const relativePath of paths) {
		const tracked = await SyncedFoldersRepository.findFile(folderId, relativePath);
		if (!tracked) continue;
		await SyncedFoldersRepository.clearDuplicatesOf(folderId, relativePath);
		if (tracked.documentId) {
			await removeDocument(tracked.documentId, { syncedFileDisposition: 'remove' });
			removedDocumentIds.push(tracked.documentId);
		} else {
			await db
				.delete(syncedFiles)
				.where(and(eq(syncedFiles.folderId, folderId), eq(syncedFiles.relativePath, relativePath)));
			// Only a synced row carries a managed copy; duplicate, ignored and
			// malformed rows have none of their own to unlink.
			if (tracked.managedPath) await removeManagedDocumentFile(tracked.managedPath);
		}
		removed += 1;
	}
	return { removed, removedDocumentIds };
}

/**
 * Whether a tracked path is already resolved and must not be offered for upload
 * again. A deleted document stays deleted while its folder is watched, while a
 * duplicate or malformed file earns another attempt once its bytes change.
 */
export function isSettledSyncFile(tracked: SyncedFile, stats: SyncFileStats): boolean {
	if (tracked.state === 'ignored') return true;
	if (tracked.lastModified !== stats.lastModified || tracked.size !== stats.size) return false;
	return tracked.state !== 'synced' || tracked.documentId !== null;
}

function unchangedResult(documentId: string | null, relativePath: string): ApiDocumentIngestResult {
	return {
		documentId: documentId ?? '',
		title: titleFor(relativePath),
		sourcePath: relativePath,
		pageCount: 0,
		chunkCount: 0
	};
}
