import { extname, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { watch, type FSWatcher } from "chokidar";
import { db } from "$lib/server/database/database";
import { synced_folders, type SyncedFolder } from "$lib/server/database/schema";
import {
  syncFolder,
  type SyncFileProgress,
  type SyncFolderResult,
  type SyncProgressCallback,
} from "./folder-sync";

type Folder = Pick<SyncedFolder, "id" | "path">;
type WatchedFolder = {
  watcher: FSWatcher;
  timer?: ReturnType<typeof setTimeout>;
  running?: Promise<SyncFolderResult | undefined>;
  rerun: boolean;
  closed: boolean;
  listeners: Set<SyncProgressCallback>;
  progress: Map<string, SyncFileProgress>;
};

const globalState = globalThis as typeof globalThis & {
  folderWatchers?: Map<string, WatchedFolder>;
};
const folders = (globalState.folderWatchers ??= new Map());

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function recordError(folderId: string, error: unknown) {
  const text = message(error);
  console.error(`[Folder Watcher] ${folderId}: ${text}`);
  await db.update(synced_folders).set({ lastError: text }).where(eq(synced_folders.id, folderId));
}

async function run(folderId: string): Promise<SyncFolderResult | undefined> {
  const state = folders.get(folderId);
  if (!state || state.closed) return;
  if (state.running) return state.running;

  state.running = (async () => {
    let result: SyncFolderResult | undefined;
    do {
      state.rerun = false;
      state.progress.clear();
      try {
        result = await syncFolder(
          folderId,
          (progress) => {
            state.progress.set(progress.sourcePath, progress);
            for (const listener of state.listeners) listener(progress);
          },
          () => state.closed,
        );
      } catch (error) {
        await recordError(folderId, error);
      }
    } while (state.rerun && !state.closed);
    return result;
  })();

  try {
    return await state.running;
  } finally {
    state.running = undefined;
  }
}

export const folderWatcherManager = {
  async start(folder: Folder) {
    await this.stop(folder.id);

    const watcher = watch(resolve(folder.path), {
      ignoreInitial: true,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 250 },
      ignored: (path, stats) =>
        Boolean(stats?.isFile() && extname(path).toLowerCase() !== ".pdf"),
    });
    const state: WatchedFolder = {
      watcher,
      rerun: false,
      closed: false,
      listeners: new Set(),
      progress: new Map(),
    };
    folders.set(folder.id, state);

    watcher.on("all", (event, path) => {
      if (
        event === "addDir" ||
        event === "unlinkDir" ||
        (["add", "change", "unlink"].includes(event) && extname(path).toLowerCase() === ".pdf")
      ) {
        this.scheduleSync(folder.id);
      }
    });
    watcher.on("error", (error) => void recordError(folder.id, error));

    try {
      await new Promise<void>((ready, reject) => {
        watcher.once("ready", ready);
        watcher.once("error", reject);
      });
    } catch (error) {
      folders.delete(folder.id);
      await watcher.close();
      throw error;
    }
  },

  async startRegistered() {
    for (const folder of await db.select().from(synced_folders)) {
      try {
        await this.start(folder);
      } catch (error) {
        await recordError(folder.id, error);
      }
    }
  },

  scheduleSync(folderId: string) {
    const state = folders.get(folderId);
    if (!state || state.closed) return;
    if (state.running) {
      state.rerun = true;
      return;
    }
    clearTimeout(state.timer);
    state.timer = setTimeout(() => void run(folderId), 2000);
  },

  async syncNow(folderId: string, onProgress?: SyncProgressCallback) {
    const state = folders.get(folderId);
    if (!state || state.closed) return;

    clearTimeout(state.timer);
    if (onProgress) {
      state.listeners.add(onProgress);
      if (state.running) for (const progress of state.progress.values()) onProgress(progress);
    }
    try {
      return await run(folderId);
    } finally {
      if (onProgress) state.listeners.delete(onProgress);
    }
  },

  async stop(folderId: string) {
    const state = folders.get(folderId);
    if (!state) return;
    state.closed = true;
    clearTimeout(state.timer);
    await state.watcher.close();
    await state.running;
    if (folders.get(folderId) === state) folders.delete(folderId);
  },

  async waitForIdle(folderId: string) {
    await folders.get(folderId)?.running;
  },

  async stopAll() {
    await Promise.all([...folders.keys()].map((id) => this.stop(id)));
  },

  isWatching(folderId: string) {
    return folders.has(folderId);
  },
};
