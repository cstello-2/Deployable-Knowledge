import { and, asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import {
	syncedFiles,
	syncedFolders,
	type NewSyncedFolder,
	type SyncedFile,
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

	static async delete(id: string): Promise<void> {
		await db.delete(syncedFolders).where(eq(syncedFolders.id, id));
	}
}
