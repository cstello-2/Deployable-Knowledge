import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { DocumentIngestProgress } from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { documents, synced_files, synced_folders } from "$lib/server/database/schema";
import { ingestDocument, isSupportedDocument } from "$lib/server/rag/ingest-document";
import { removeDocument, removeManagedDocumentFile } from "./remove-document";

export type SyncFolderResult = {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  failed: number;
};

export type SyncFileProgress = {
  sourcePath: string;
  status: "queued" | "ingesting" | "added" | "updated" | "unchanged" | "removed" | "failed";
  percent?: number;
  label?: string;
  message?: string;
};

export type SyncProgressCallback = (progress: SyncFileProgress) => void;

type SyncFile = {
  sourcePath: string;
  mtimeMs: number;
  size: number;
};

async function findFiles(directory: string): Promise<SyncFile[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  const files = entries.filter(
    (entry) => entry.isFile() && isSupportedDocument(entry.name),
  );

  return Promise.all(
    files.map(async (file) => {
      const sourcePath = resolve(file.parentPath, file.name);
      const { mtimeMs, size } = await stat(sourcePath);
      return { sourcePath, mtimeMs: Math.trunc(mtimeMs), size };
    }),
  );
}

async function ingestManagedCopy(
  sourcePath: string,
  managedPath: string,
  onProgress?: (progress: DocumentIngestProgress) => void,
) {
  try {
    await copyFile(sourcePath, managedPath);

    const title = basename(sourcePath, extname(sourcePath)).trim() || basename(sourcePath);
    return await ingestDocument({ filePath: managedPath, title }, onProgress);
  } catch (error) {
    await removeManagedDocumentFile(managedPath);
    throw error;
  }
}

async function managedPathFor(sourcePath: string): Promise<string> {
  const contentHash = createHash("sha256").update(await readFile(sourcePath)).digest("hex");
  return join("documents", contentHash.slice(0, 16) + extname(sourcePath).toLowerCase());
}

export async function syncFolder(
  folderId: string,
  onProgress?: SyncProgressCallback,
  shouldStop?: () => boolean,
): Promise<SyncFolderResult> {
  const [folder] = await db
    .select()
    .from(synced_folders)
    .where(eq(synced_folders.id, folderId));

  if (!folder) throw new Error(`Synced folder not found: ${folderId}`);

  const folderPath = resolve(folder.path);
  const sourceFiles = await findFiles(folderPath);

  const trackedFiles = await db
    .select()
    .from(synced_files)
    .where(eq(synced_files.folderId, folderId));
  const trackedByPath = new Map(trackedFiles.map((file) => [file.sourcePath, file]));
  const currentPaths = new Set(sourceFiles.map((file) => file.sourcePath));
  const result: SyncFolderResult = {
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    failed: 0,
  };

  for (const file of sourceFiles) {
    if (!trackedByPath.get(file.sourcePath)?.ignored) {
      onProgress?.({ sourcePath: file.sourcePath, status: "queued" });
    }
  }

  await mkdir("documents", { recursive: true });

  // Intentionally sequential until the Scribe lifecycle is made concurrency-safe and benchmarked.
  for (const file of sourceFiles) {
    if (shouldStop?.()) return result;
    const tracked = trackedByPath.get(file.sourcePath);

    if (tracked?.ignored) {
      continue;
    }

    const unchanged =
      tracked?.documentId &&
      tracked.mtimeMs === file.mtimeMs &&
      tracked.size === file.size;

    if (unchanged) {
      result.unchanged += 1;
      onProgress?.({ sourcePath: file.sourcePath, status: "unchanged" });
      continue;
    }

    let managedPath = tracked?.managedPath ?? "";
    let ingestedDocumentId: string | null = null;
    let createdDocument = false;

    try {
      onProgress?.({ sourcePath: file.sourcePath, status: "ingesting" });

      managedPath = await managedPathFor(file.sourcePath);
      const [existingDocument] = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.sourcePath, managedPath))
        .limit(1);
      const [existingOwner] = existingDocument
        ? await db
            .select({ sourcePath: synced_files.sourcePath, folderId: synced_files.folderId })
            .from(synced_files)
            .where(eq(synced_files.documentId, existingDocument.id))
            .limit(1)
        : [];

      if (existingOwner && existingOwner.sourcePath !== file.sourcePath) {
        const renamedInThisFolder =
          existingOwner.folderId === folderId && !currentPaths.has(existingOwner.sourcePath);

        if (renamedInThisFolder) {
          await db.delete(synced_files).where(eq(synced_files.sourcePath, existingOwner.sourcePath));
          currentPaths.add(existingOwner.sourcePath);
        } else {
          if (tracked?.documentId) {
            await removeDocument(tracked.documentId, { syncedFileDisposition: "remove" });
          }
          result.unchanged += 1;
          onProgress?.({
            sourcePath: file.sourcePath,
            status: "unchanged",
          });
          continue;
        }
      }

      if (existingDocument) {
        ingestedDocumentId = existingDocument.id;
      } else {
        ingestedDocumentId = (
          await ingestManagedCopy(file.sourcePath, managedPath, (progress) => {
            onProgress?.({ sourcePath: file.sourcePath, status: "ingesting", ...progress });
          })
        ).documentId;
        createdDocument = true;
      }

      await db
        .insert(synced_files)
        .values({
          sourcePath: file.sourcePath,
          folderId,
          managedPath,
          documentId: ingestedDocumentId,
          mtimeMs: file.mtimeMs,
          size: file.size,
          ignored: false,
        })
        .onConflictDoUpdate({
          target: synced_files.sourcePath,
          set: {
            folderId,
            managedPath,
            documentId: ingestedDocumentId,
            mtimeMs: file.mtimeMs,
            size: file.size,
            ignored: false,
          },
        });

      if (tracked?.documentId && tracked.documentId !== ingestedDocumentId) {
        await removeDocument(tracked.documentId, { syncedFileDisposition: "remove" });
      }

      const status = tracked ? "updated" : "added";
      result[status] += 1;
      onProgress?.({ sourcePath: file.sourcePath, status });
    } catch (error) {
      const message = String(error);
      result.failed += 1;
      onProgress?.({ sourcePath: file.sourcePath, status: "failed", message });
      console.error(`[Folder Sync] ${file.sourcePath}: ${message}`);

      if (!tracked && createdDocument) {
        try {
          if (ingestedDocumentId) {
            await removeDocument(ingestedDocumentId, { syncedFileDisposition: "remove" });
          } else {
            await removeManagedDocumentFile(managedPath);
          }
        } catch (cleanupError) {
          console.error(`[Folder Sync] Cleanup failed for ${file.sourcePath}: ${cleanupError}`);
        }
      }
    }
  }

  if (shouldStop?.()) return result;

  for (const tracked of trackedFiles) {
    if (currentPaths.has(tracked.sourcePath)) continue;

    if (tracked.documentId) {
      await removeDocument(tracked.documentId, {
        syncedFileDisposition: "remove",
      });
    } else {
      await db.delete(synced_files).where(eq(synced_files.sourcePath, tracked.sourcePath));
      await removeManagedDocumentFile(tracked.managedPath);
    }

    result.removed += 1;
    onProgress?.({ sourcePath: tracked.sourcePath, status: "removed" });
  }

  const lastError = result.failed > 0 ? `${result.failed} file(s) failed to sync.` : null;
  await db
    .update(synced_folders)
    .set({ lastError })
    .where(eq(synced_folders.id, folderId));

  return result;
}
