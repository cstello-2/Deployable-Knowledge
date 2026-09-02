import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import type { ApiDocumentIngestProgress, ApiDocumentIngestResult } from '$lib/types';
import { db } from '$lib/server/database/database';
import { documents, syncedFiles } from '$lib/server/database/schema';
import { SyncedFoldersRepository } from '$lib/server/repositories';
import { ingestDocument } from '$lib/server/rag/ingest-document';
import { managedPathForHash, titleFor } from './ingest-file';
import { managedExtensionFor, writeManagedArtifacts } from './managed-artifacts';
import { removeDocument, removeManagedDocumentFile } from './remove-document';
import { handlerForPath } from './source-types';

export interface UploadedSyncFile {
	relativePath: string;
	lastModified: number;
	size: number;
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
		await SyncedFoldersRepository.clearFileFailure(folderId, file.relativePath);
		await SyncedFoldersRepository.setLastError(folderId, null);
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[Folder Sync] ${file.relativePath}: ${message}`);
		await SyncedFoldersRepository.recordFileFailure(folderId, file, message).catch((recordError) =>
			console.error(`[Folder Sync] Could not record ${file.relativePath}:`, recordError)
		);
		await SyncedFoldersRepository.setLastError(folderId, message).catch(() => {});
		throw error;
	}
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
	if (tracked?.ignored || (tracked?.documentId && sameStats(tracked, file))) {
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

		await db
			.insert(syncedFiles)
			.values({
				folderId,
				relativePath: file.relativePath,
				managedPath,
				documentId: ingestedDocumentId,
				lastModified: file.lastModified,
				size: file.size,
				ignored: false
			})
			.onConflictDoUpdate({
				target: [syncedFiles.folderId, syncedFiles.relativePath],
				set: {
					managedPath,
					documentId: ingestedDocumentId,
					lastModified: file.lastModified,
					size: file.size,
					ignored: false
				}
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
		if (tracked.documentId) {
			await removeDocument(tracked.documentId, { syncedFileDisposition: 'remove' });
			removedDocumentIds.push(tracked.documentId);
		} else {
			await db
				.delete(syncedFiles)
				.where(and(eq(syncedFiles.folderId, folderId), eq(syncedFiles.relativePath, relativePath)));
			await removeManagedDocumentFile(tracked.managedPath);
		}
		removed += 1;
	}
	return { removed, removedDocumentIds };
}

function sameStats(
	tracked: { lastModified: number; size: number },
	file: { lastModified: number; size: number }
): boolean {
	return tracked.lastModified === file.lastModified && tracked.size === file.size;
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
