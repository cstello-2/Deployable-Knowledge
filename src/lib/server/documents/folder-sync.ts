import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { basename, extname, join, resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { documents, synced_files, synced_folders } from "$lib/server/database/schema";
import { ingestDocument } from "$lib/server/rag/ingest-document";
import { removeDocument, removeManagedDocumentFile } from "./remove-document";

export type SyncFolderResult = {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  failed: number;
};

export type SyncFileStatus =
  | "queued"
  | "ingesting"
  | "added"
  | "updated"
  | "unchanged"
  | "removed"
  | "failed";

export type SyncFileProgress = {
  sourcePath: string;
  status: SyncFileStatus;
  message?: string;
};

export type SyncProgressCallback = (progress: SyncFileProgress) => void;

type PdfFile = {
  sourcePath: string;
  mtimeMs: number;
  size: number;
};

async function findPdfFiles(directory: string): Promise<PdfFile[]> {
  const files: PdfFile[] = [];
  const entries = await readdir(directory, { withFileTypes: true });

  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findPdfFiles(entryPath)));
      continue;
    }

    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".pdf") continue;

    const fileStats = await stat(entryPath);
    files.push({
      sourcePath: resolve(entryPath),
      mtimeMs: Math.trunc(fileStats.mtimeMs),
      size: fileStats.size,
    });
  }

  return files;
}

async function hasPdfHeader(filePath: string): Promise<boolean> {
  const file = await open(filePath, "r");

  try {
    const header = Buffer.alloc(5);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    return bytesRead === header.length && header.toString() === "%PDF-";
  } finally {
    await file.close();
  }
}

async function unlinkIfPresent(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function ingestManagedCopy(sourcePath: string, managedPath: string) {
  const replacementId = randomUUID();
  const stagedPath = `${managedPath}.${replacementId}.tmp`;
  const backupPath = `${managedPath}.${replacementId}.bak`;
  let hasBackup = false;

  await copyFile(sourcePath, stagedPath);

  try {
    try {
      await rename(managedPath, backupPath);
      hasBackup = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    await rename(stagedPath, managedPath);
  } catch (error) {
    await unlinkIfPresent(stagedPath);
    if (hasBackup) await rename(backupPath, managedPath);
    throw error;
  }

  try {
    const result = await ingestDocument({
      filePath: managedPath,
      title: pdfTitle(sourcePath),
    });
    if (hasBackup) await unlinkIfPresent(backupPath);
    return result;
  } catch (error) {
    await unlinkIfPresent(managedPath);
    if (hasBackup) await rename(backupPath, managedPath);
    throw error;
  }
}

async function managedPathFor(sourcePath: string): Promise<string> {
  const contentHash = createHash("sha256").update(await readFile(sourcePath)).digest("hex");
  return join("documents", `${contentHash.slice(0, 16)}.pdf`);
}

function pdfTitle(sourcePath: string): string {
  const name = basename(sourcePath);
  return name.replace(/\.pdf$/i, "").trim() || name;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  return cause ? `${error.message}: ${errorMessage(cause)}` : error.message;
}

async function recordFolderError(folderId: string, error: unknown) {
  await db
    .update(synced_folders)
    .set({ lastError: errorMessage(error) })
    .where(eq(synced_folders.id, folderId));
}

export async function syncFolder(
  folderId: string,
  onProgress?: SyncProgressCallback,
  shouldStop?: () => boolean,
): Promise<SyncFolderResult> {
  const [folder] = await db
    .select()
    .from(synced_folders)
    .where(eq(synced_folders.id, folderId))
    .limit(1);

  if (!folder) throw new Error(`Synced folder not found: ${folderId}`);

  const folderPath = resolve(folder.path);
  let pdfFiles: PdfFile[];

  try {
    const rootStats = await stat(folderPath);
    if (!rootStats.isDirectory()) throw new Error(`Synced folder is not a directory: ${folderPath}`);
    pdfFiles = await findPdfFiles(folderPath);
  } catch (error) {
    await recordFolderError(folderId, error);
    throw error;
  }

  const trackedFiles = await db
    .select()
    .from(synced_files)
    .where(eq(synced_files.folderId, folderId));
  const trackedByPath = new Map(trackedFiles.map((file) => [file.sourcePath, file]));
  const currentPaths = new Set(pdfFiles.map((file) => file.sourcePath));
  const result: SyncFolderResult = {
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    failed: 0,
  };

  for (const file of pdfFiles) {
    if (!trackedByPath.get(file.sourcePath)?.ignored) {
      onProgress?.({ sourcePath: file.sourcePath, status: "queued" });
    }
  }

  await mkdir("documents", { recursive: true });

  // Intentionally sequential until the Scribe lifecycle is made concurrency-safe and benchmarked.
  for (const file of pdfFiles) {
    if (shouldStop?.()) return result;
    const tracked = trackedByPath.get(file.sourcePath);

    if (tracked?.ignored) {
      continue;
    }

    const unchanged =
      tracked?.documentId &&
      tracked.mtimeMs === file.mtimeMs &&
      tracked.size === file.size &&
      !resolve(tracked.managedPath).includes(`${sep}documents${sep}synced${sep}`);

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

      if (!(await hasPdfHeader(file.sourcePath))) {
        throw new Error("File has a .pdf extension but no PDF header.");
      }

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
            message: "This PDF is already managed by another folder.",
          });
          continue;
        }
      }

      if (existingDocument) {
        ingestedDocumentId = existingDocument.id;
      } else {
        ingestedDocumentId = (await ingestManagedCopy(file.sourcePath, managedPath)).documentId;
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
      const message = errorMessage(error);
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
          console.error(`[Folder Sync] Cleanup failed for ${file.sourcePath}: ${errorMessage(cleanupError)}`);
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

  const lastError = result.failed > 0 ? `${result.failed} PDF file(s) failed to sync.` : null;
  await db
    .update(synced_folders)
    .set({ lastError })
    .where(eq(synced_folders.id, folderId));

  return result;
}
