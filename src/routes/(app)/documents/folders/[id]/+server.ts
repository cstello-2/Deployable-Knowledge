import { error, json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { synced_files, synced_folders } from "$lib/server/database/schema";
import { folderWatcherManager } from "$lib/server/documents/folder-watcher";
import { removeDocument, removeManagedDocumentFile } from "$lib/server/documents/remove-document";
import type { RequestHandler } from "./$types";

async function getFolder(id: string) {
  const [folder] = await db
    .select()
    .from(synced_folders)
    .where(eq(synced_folders.id, id))
    .limit(1);

  if (!folder) throw error(404, "Synced folder not found.");
  return folder;
}

export const POST: RequestHandler = async ({ params }) => {
  const folder = await getFolder(params.id);

  if (!folderWatcherManager.isWatching(folder.id)) {
    await folderWatcherManager.start(folder);
  }

  const result = await folderWatcherManager.syncNow(folder.id);
  return json({ folder, result });
};

export const DELETE: RequestHandler = async ({ params, url }) => {
  const folder = await getFolder(params.id);

  const removeDocuments = url.searchParams.get("removeDocuments") === "true";
  await folderWatcherManager.stop(folder.id);

  if (removeDocuments) {
    const files = await db
      .select()
      .from(synced_files)
      .where(eq(synced_files.folderId, folder.id));

    for (const file of files) {
      if (file.documentId) {
        await removeDocument(file.documentId, { syncedFileDisposition: "remove" });
      } else {
        await removeManagedDocumentFile(file.managedPath);
      }
    }
  }

  await db.delete(synced_folders).where(eq(synced_folders.id, folder.id));

  return json({ removed: true });
};
