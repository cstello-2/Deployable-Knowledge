import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/database/database';
import {
	synced_files as syncedFiles,
	synced_folders as syncedFolders,
	type NewSyncedFolder,
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

	static async create(folder: NewSyncedFolder): Promise<void> {
		await db.insert(syncedFolders).values(folder);
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
