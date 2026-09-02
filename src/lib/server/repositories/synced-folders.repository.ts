import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import {
	syncedFiles,
	syncedFolders,
	type NewSyncedFolder,
	type SyncedFile,
	type SyncedFileState,
	type SyncedFolder
} from '$lib/server/database/schema';

export interface SyncedFileStat {
	relativePath: string;
	lastModified: number;
	size: number;
}

export class SyncedFoldersRepository {
	static list(): Promise<SyncedFolder[]> {
		return db.select().from(syncedFolders).orderBy(asc(syncedFolders.createdAt));
	}

	static async find(id: string): Promise<SyncedFolder | null> {
		const [folder] = await db.select().from(syncedFolders).where(eq(syncedFolders.id, id)).limit(1);
		return folder ?? null;
	}

	static async upsert(folder: NewSyncedFolder): Promise<void> {
		await db
			.insert(syncedFolders)
			.values(folder)
			.onConflictDoUpdate({ target: syncedFolders.id, set: { name: folder.name } });
	}

	static async findFile(folderId: string, relativePath: string): Promise<SyncedFile | null> {
		const [file] = await db
			.select()
			.from(syncedFiles)
			.where(and(eq(syncedFiles.folderId, folderId), eq(syncedFiles.relativePath, relativePath)))
			.limit(1);
		return file ?? null;
	}

	static async deleteFile(folderId: string, relativePath: string): Promise<void> {
		await db
			.delete(syncedFiles)
			.where(and(eq(syncedFiles.folderId, folderId), eq(syncedFiles.relativePath, relativePath)));
	}

	static async setLastError(id: string, lastError: string | null): Promise<void> {
		await db.update(syncedFolders).set({ lastError }).where(eq(syncedFolders.id, id));
	}

	static syncedFiles(folderId: string) {
		return db.select().from(syncedFiles).where(eq(syncedFiles.folderId, folderId));
	}

	/**
	 * Parks a path in a terminal state so reconciles stop offering it. The row
	 * keeps the stats it was resolved at, which is how a later edit on disk gets
	 * the file another attempt without a manual retry.
	 */
	static async markFile(
		folderId: string,
		file: SyncedFileStat,
		state: Exclude<SyncedFileState, 'synced'>,
		message: string | null = null
	): Promise<void> {
		const values = {
			folderId,
			relativePath: file.relativePath,
			managedPath: null,
			documentId: null,
			lastModified: file.lastModified,
			size: file.size,
			state,
			message
		};
		await db
			.insert(syncedFiles)
			.values(values)
			.onConflictDoUpdate({
				target: [syncedFiles.folderId, syncedFiles.relativePath],
				set: values
			});
	}

	/**
	 * Frees the paths parked as duplicates of `relativePath`. Once the file they
	 * deferred to is gone, one of them has to be ingested in its place.
	 */
	static async clearDuplicatesOf(folderId: string, relativePath: string): Promise<void> {
		await db
			.delete(syncedFiles)
			.where(
				and(
					eq(syncedFiles.folderId, folderId),
					eq(syncedFiles.state, 'duplicate'),
					eq(syncedFiles.message, relativePath)
				)
			);
	}

	static async malformedCounts(): Promise<Map<string, number>> {
		const rows = await db
			.select({ folderId: syncedFiles.folderId, malformed: count() })
			.from(syncedFiles)
			.where(eq(syncedFiles.state, 'malformed'))
			.groupBy(syncedFiles.folderId);
		return new Map(rows.map(({ folderId, malformed }) => [folderId, malformed]));
	}

	/** Drops the malformed rows so the next sync walks those paths again. */
	static async clearMalformed(folderId: string): Promise<number> {
		const cleared = await db
			.delete(syncedFiles)
			.where(and(eq(syncedFiles.folderId, folderId), eq(syncedFiles.state, 'malformed')))
			.returning({ relativePath: syncedFiles.relativePath });
		return cleared.length;
	}

	static async delete(id: string): Promise<void> {
		await db.delete(syncedFolders).where(eq(syncedFolders.id, id));
	}
}
