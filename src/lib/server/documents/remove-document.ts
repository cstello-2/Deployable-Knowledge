import { unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { documents, synced_files } from "$lib/server/database/schema";

export type SyncedFileDisposition = "ignore" | "remove";

type RemoveDocumentOptions = {
  syncedFileDisposition?: SyncedFileDisposition;
};

export function containsPath(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function isManagedDocumentPath(filePath: string): boolean {
  const root = resolve("documents");
  const path = resolve(filePath);
  return path !== root && containsPath(root, path);
}

export async function removeManagedDocumentFile(filePath: string): Promise<void> {
  if (!isManagedDocumentPath(filePath)) return;

  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

export async function removeDocument(
  documentId: string,
  options: RemoveDocumentOptions = {},
): Promise<boolean> {
  const disposition = options.syncedFileDisposition ?? "ignore";
  const [document] = await db
    .select({ sourcePath: documents.sourcePath })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  const [syncedFile] = await db
    .select({ managedPath: synced_files.managedPath })
    .from(synced_files)
    .where(eq(synced_files.documentId, documentId))
    .limit(1);

  await db.transaction(async (transaction) => {
    if (disposition === "remove") {
      await transaction.delete(synced_files).where(eq(synced_files.documentId, documentId));
    } else {
      await transaction
        .update(synced_files)
        .set({ documentId: null, ignored: true })
        .where(eq(synced_files.documentId, documentId));
    }

    await transaction.delete(documents).where(eq(documents.id, documentId));
  });

  const managedPath = syncedFile?.managedPath ?? document?.sourcePath;
  if (managedPath) await removeManagedDocumentFile(managedPath);

  return Boolean(document);
}
