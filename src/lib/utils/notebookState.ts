import type { AppState } from "$lib/state.svelte";
import type { NotebookWithPages } from "$lib/server/database/schema";
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
