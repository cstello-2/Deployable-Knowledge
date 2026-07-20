import type { AppState } from "$lib/state.svelte";
import type { NotebookWithPages } from "$lib/server/database/schema";
import type { NotebookSourcesRequest } from "$lib/requestTypes";
import { pruneNotebookContextPageIds } from "./notebookContextSelection";

export type NotebookStateResponse = {
  activeNotebookId: string | null;
  notebooks: NotebookWithPages[];
};

export function applyNotebookState(
  appState: AppState,
  data: NotebookStateResponse,
) {
  appState.notebooks = data.notebooks ?? [];
  appState.activeNotebookId =
    data.activeNotebookId ?? appState.notebooks[0]?.id ?? null;
  appState.activeNotebook =
    appState.notebooks.find(
      (notebook) => notebook.id === appState.activeNotebookId,
    ) ?? appState.notebooks[0] ?? null;
  appState.activePage =
    appState.activeNotebook?.pages.find(
      (page) => page.id === appState.activeNotebook?.activePageId,
    ) ?? appState.activeNotebook?.pages[0] ?? null;
  pruneNotebookContextPageIds(appState, appState.notebooks);
}

export async function attachChunkToNotebookDestination(
  appState: AppState,
  destination: {
    notebookId: string;
    pageId: string;
  },
  chunkId: string,
): Promise<{ duplicate: boolean }> {
  const selectResponse = await fetch(
    `/notebooks/${destination.notebookId}/pages/${destination.pageId}/select`,
    { method: "POST" },
  );
  const notebookState = await selectResponse.json() as NotebookStateResponse & {
    error?: string;
    message?: string;
  };
  if (!selectResponse.ok) {
    throw new Error(
      notebookState.message ||
        notebookState.error ||
        "The selected notebook page no longer exists.",
    );
  }

  const sourcesResponse = await fetch(
    `/notebooks/${destination.notebookId}/sources`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chunk_ids: [chunkId],
      } satisfies NotebookSourcesRequest),
    },
  );
  const sourcesData = await sourcesResponse.json() as {
    error?: string;
    message?: string;
    added?: number;
  };
  if (!sourcesResponse.ok) {
    throw new Error(
      sourcesData.message ||
        sourcesData.error ||
        "The chunk could not be added to Loaded Sources.",
    );
  }

  applyNotebookState(appState, notebookState);
  return { duplicate: sourcesData.added === 0 };
}
