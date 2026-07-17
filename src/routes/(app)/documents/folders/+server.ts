import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { error, json } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { synced_folders, type SyncedFolder } from "$lib/server/database/schema";
import { folderWatcherManager } from "$lib/server/documents/folder-watcher";
import { containsPath } from "$lib/server/documents/remove-document";
import type { RequestHandler } from "./$types";

type Folder = Pick<SyncedFolder, "id" | "path">;

function pathsOverlap(first: string, second: string): boolean {
  return containsPath(first, second) || containsPath(second, first);
}

async function folderRows() {
  const folders = await db.select().from(synced_folders).orderBy(asc(synced_folders.createdAt));

  return folders.map((folder) => ({
    ...folder,
    watching: folderWatcherManager.isWatching(folder.id),
  }));
}

function streamFolderSync(folder: Folder, created: boolean): Response {
  const encoder = new TextEncoder();
  let connected = true;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        if (!connected) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          connected = false;
        }
      };

      send({ type: "folder", folderId: folder.id, created });

      try {
        if (!folderWatcherManager.isWatching(folder.id)) {
          await folderWatcherManager.start(folder);
        }

        const result = await folderWatcherManager.syncNow(folder.id, (progress) => {
          send({ type: "file", ...progress });
        });
        send({ type: "done", result });
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : String(syncError);
        await db
          .update(synced_folders)
          .set({ lastError: message })
          .where(eq(synced_folders.id, folder.id));
        send({ type: "error", message });
      } finally {
        if (connected) controller.close();
      }
    },
    cancel() {
      connected = false;
    },
  });

  return new Response(stream, {
    status: created ? 201 : 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
    },
  });
}

export const GET: RequestHandler = async () => {
  return json({ folders: await folderRows() });
};

export const POST: RequestHandler = async ({ request }) => {
  let body: { path?: unknown };

  try {
    body = await request.json();
  } catch {
    throw error(400, "Provide a folder path.");
  }

  if (typeof body.path !== "string" || !body.path.trim()) {
    throw error(400, "Provide a folder path.");
  }

  const requestedPath = resolve(body.path.trim());
  let folderPath: string;

  try {
    folderPath = await realpath(requestedPath);
    const folderStats = await stat(folderPath);
    if (!folderStats.isDirectory()) throw new Error("Path is not a directory.");
    await access(folderPath, constants.R_OK);
  } catch {
    throw error(400, "Folder does not exist or cannot be read.");
  }

  const managedDocumentsPath = resolve("documents");
  if (pathsOverlap(folderPath, managedDocumentsPath)) {
    throw error(400, "The managed documents directory cannot be watched.");
  }

  const homePath = await realpath(homedir());
  if (!containsPath(homePath, folderPath)) {
    throw error(400, "Select a folder inside your home directory.");
  }

  const existingFolders = await db.select().from(synced_folders);
  const existingFolder = existingFolders.find((folder) => folder.path === folderPath);
  if (existingFolder) return streamFolderSync(existingFolder, false);

  if (existingFolders.some((folder) => pathsOverlap(folder.path, folderPath))) {
    throw error(409, "This folder overlaps an existing synced folder.");
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  await db.insert(synced_folders).values({
    id,
    path: folderPath,
    createdAt: now,
  });

  return streamFolderSync(
    {
      id,
      path: folderPath,
    },
    true,
  );
};
