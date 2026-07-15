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
  timer: NodeJS.Timeout | null;
  running: Promise<SyncFolderResult | undefined> | null;
  lastResult: SyncFolderResult | undefined;
  rerun: boolean;
  closed: boolean;
  stopping: Promise<void> | null;
  progressListeners: Set<SyncProgressCallback>;
  progressByPath: Map<string, SyncFileProgress>;
};

const globalWatchers = globalThis as typeof globalThis & {
  deployableKnowledgeFolderWatchers?: { folders?: Map<string, WatchedFolder> };
  deployableKnowledgeFolderWatcherState?: Map<string, WatchedFolder>;
};

const sharedFolders =
  globalWatchers.deployableKnowledgeFolderWatcherState ??
  globalWatchers.deployableKnowledgeFolderWatchers?.folders ??
  new Map<string, WatchedFolder>();
globalWatchers.deployableKnowledgeFolderWatcherState = sharedFolders;

const FILE_EVENTS = new Set(["add", "change", "unlink"]);

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  return cause ? `${error.message}: ${errorMessage(cause)}` : error.message;
}

function isRelevantEvent(event: string, filePath: string): boolean {
  if (event === "addDir" || event === "unlinkDir") return true;
  return FILE_EVENTS.has(event) && extname(filePath).toLowerCase() === ".pdf";
}

export class FolderWatcherManager {
  readonly folders = sharedFolders;

  async start(folder: Folder): Promise<void> {
    await this.stop(folder.id);

    const watcher = watch(resolve(folder.path), {
      ignoreInitial: true,
      atomic: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 250,
      },
      ignored: (filePath, stats) =>
        Boolean(stats?.isFile() && extname(filePath).toLowerCase() !== ".pdf"),
    });
    const state: WatchedFolder = {
      watcher,
      timer: null,
      running: null,
      lastResult: undefined,
      rerun: false,
      closed: false,
      stopping: null,
      progressListeners: new Set(),
      progressByPath: new Map(),
    };
    this.folders.set(folder.id, state);

    watcher.on("all", (event, filePath) => {
      if (isRelevantEvent(event, filePath)) this.scheduleSync(folder.id);
    });
    watcher.on("error", (error) => this.reportError(folder.id, error));

    try {
      await new Promise<void>((ready, reject) => {
        watcher.once("ready", ready);
        watcher.once("error", reject);
      });
    } catch (error) {
      this.folders.delete(folder.id);
      await watcher.close();
      throw error;
    }
  }

  async startRegistered(): Promise<void> {
    const folders = await db.select().from(synced_folders);

    for (const folder of folders) {
      try {
        await this.start(folder);
      } catch (error) {
        this.reportError(folder.id, error);
      }
    }
  }

  scheduleSync(folderId: string): void {
    const state = this.folders.get(folderId);
    if (!state || state.closed) return;

    if (state.running) {
      state.rerun = true;
      return;
    }

    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.timer = null;
      void this.runSync(folderId);
    }, 2000);
  }

  async syncNow(
    folderId: string,
    onProgress?: SyncProgressCallback,
  ): Promise<SyncFolderResult | undefined> {
    const state = this.folders.get(folderId);
    if (!state || state.closed) return undefined;
    state.progressListeners ??= new Set();
    state.progressByPath ??= new Map();

    if (onProgress) {
      state.progressListeners.add(onProgress);
      if (state.running) {
        for (const progress of state.progressByPath.values()) onProgress(progress);
      }
    }

    try {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }

      if (state.running) {
        await state.running;
        return state.lastResult;
      }

      return await this.runSync(folderId);
    } finally {
      if (onProgress) state.progressListeners.delete(onProgress);
    }
  }

  async stop(folderId: string): Promise<void> {
    const state = this.folders.get(folderId);
    if (!state) return;
    if (state.stopping) return state.stopping;

    state.closed = true;
    if (state.timer) clearTimeout(state.timer);
    state.stopping = (async () => {
      await state.watcher.close();
      await state.running;
      if (this.folders.get(folderId) === state) this.folders.delete(folderId);
    })();
    await state.stopping;
  }

  async waitForIdle(folderId: string): Promise<void> {
    await this.folders.get(folderId)?.running;
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.folders.keys()].map((folderId) => this.stop(folderId)));
  }

  isWatching(folderId: string): boolean {
    return this.folders.has(folderId);
  }

  private async runSync(folderId: string): Promise<SyncFolderResult | undefined> {
    const state = this.folders.get(folderId);
    if (!state || state.closed) return undefined;
    if (state.running) return state.running;

    state.running = (async () => {
      do {
        state.rerun = false;
        state.progressListeners ??= new Set();
        state.progressByPath = new Map();

        try {
          state.lastResult = await syncFolder(
            folderId,
            (progress) => {
              state.progressByPath.set(progress.sourcePath, progress);
              for (const listener of state.progressListeners) listener(progress);
            },
            () => state.closed,
          );
        } catch (error) {
          this.reportError(folderId, error);
        }
      } while (state.rerun && !state.closed);
    })();

    await state.running;
    state.running = null;
    return state.lastResult;
  }

  private reportError(folderId: string, error: unknown): void {
    const message = errorMessage(error);
    console.error(`[Folder Watcher] ${folderId}: ${message}`);
    void db
      .update(synced_folders)
      .set({ lastError: message })
      .where(eq(synced_folders.id, folderId))
      .catch((databaseError) => {
        console.error(`[Folder Watcher] Failed to record error: ${errorMessage(databaseError)}`);
      });
  }
}

export const folderWatcherManager = new FolderWatcherManager();
globalWatchers.deployableKnowledgeFolderWatchers = folderWatcherManager;
