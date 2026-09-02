import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import {
	syncedFileFailures,
	syncedFiles,
	syncedFolders,
	type NewSyncedFolder,
	type SyncedFile,
	type SyncedFileFailure,
	type SyncedFolder
} from '$lib/server/database/schema';

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

	static async recordFileFailure(
		folderId: string,
		file: { relativePath: string; lastModified: number; size: number },
		message: string
	): Promise<void> {
		const values = {
			folderId,
			relativePath: file.relativePath,
			lastModified: file.lastModified,
			size: file.size,
			message,
			failedAt: new Date().toISOString()
		};
		await db
			.insert(syncedFileFailures)
			.values(values)
			.onConflictDoUpdate({
				target: [syncedFileFailures.folderId, syncedFileFailures.relativePath],
				set: values
			});
	}

	static failedFiles(folderId: string): Promise<SyncedFileFailure[]> {
		return db
			.select()
			.from(syncedFileFailures)
			.where(eq(syncedFileFailures.folderId, folderId))
			.orderBy(asc(syncedFileFailures.relativePath));
	}

	static async failedFileCounts(): Promise<Map<string, number>> {
		const rows = await db
			.select({ folderId: syncedFileFailures.folderId, failed: count() })
			.from(syncedFileFailures)
			.groupBy(syncedFileFailures.folderId);
		return new Map(rows.map(({ folderId, failed }) => [folderId, failed]));
	}

	static async clearFileFailures(folderId: string): Promise<number> {
		const cleared = await db
			.delete(syncedFileFailures)
			.where(eq(syncedFileFailures.folderId, folderId))
			.returning({ relativePath: syncedFileFailures.relativePath });
		return cleared.length;
	}

	static async clearFileFailure(folderId: string, relativePath: string): Promise<void> {
		await db
			.delete(syncedFileFailures)
			.where(
				and(
					eq(syncedFileFailures.folderId, folderId),
					eq(syncedFileFailures.relativePath, relativePath)
				)
			);
	}

	static async delete(id: string): Promise<void> {
		await db.delete(syncedFolders).where(eq(syncedFolders.id, id));
	}
}
