import type { AppState } from "$lib/state.svelte";
import type { NotebookWithPages } from "$lib/server/database/schema";

export const NOTEBOOK_CONTEXT_STORAGE_KEY = "dk:notebook-context-pages";
export const NOTEBOOK_CONTEXT_CHANGED_EVENT = "dk:notebook-context-changed";

export type NotebookContextChangedDetail = {
  pageIds: string[];
};

function normalizePageIds(pageIds: readonly string[]): string[] {
  return [...new Set(pageIds.map((id) => id.trim()).filter(Boolean))];
}

function persistPageIds(pageIds: string[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(NOTEBOOK_CONTEXT_STORAGE_KEY, JSON.stringify(pageIds));
  } catch {
    // Context selection remains available for the current browser session.
  }
}

function notifyPageIds(pageIds: string[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NotebookContextChangedDetail>(
    NOTEBOOK_CONTEXT_CHANGED_EVENT,
    { detail: { pageIds: [...pageIds] } },
  ));
}

export function setNotebookContextPageIds(
  appState: AppState,
  pageIds: readonly string[],
): string[] {
  const next = normalizePageIds(pageIds);
  appState.notebookContextPageIds = next;
  persistPageIds(next);
  notifyPageIds(next);
  return next;
}

export function restoreNotebookContextPageIds(appState: AppState): string[] {
  if (typeof localStorage === "undefined") return appState.notebookContextPageIds;
  try {
    const stored = JSON.parse(
      localStorage.getItem(NOTEBOOK_CONTEXT_STORAGE_KEY) ?? "[]",
    );
    return setNotebookContextPageIds(
      appState,
      Array.isArray(stored)
        ? stored.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return setNotebookContextPageIds(appState, []);
  }
}

export function pageProvidesNotebookContext(
  appState: AppState,
  pageId: string,
): boolean {
  return appState.notebookContextPageIds.includes(pageId);
}

export function notebookProvidesContext(
  appState: AppState,
  notebook: NotebookWithPages,
): boolean {
  return notebook.pages.length > 0 &&
    notebook.pages.every((page) =>
      pageProvidesNotebookContext(appState, page.id)
    );
}

export function toggleNotebookContextPage(
  appState: AppState,
  pageId: string,
): string[] {
  return setNotebookContextPageIds(
    appState,
    pageProvidesNotebookContext(appState, pageId)
      ? appState.notebookContextPageIds.filter((id) => id !== pageId)
      : [...appState.notebookContextPageIds, pageId],
  );
}

export function toggleNotebookContextNotebook(
  appState: AppState,
  notebook: NotebookWithPages,
): string[] {
  const pageIds = new Set(notebook.pages.map((page) => page.id));
  return setNotebookContextPageIds(
    appState,
    notebookProvidesContext(appState, notebook)
      ? appState.notebookContextPageIds.filter((id) => !pageIds.has(id))
      : [...appState.notebookContextPageIds, ...pageIds],
  );
}

export function pruneNotebookContextPageIds(
  appState: AppState,
  notebooks: readonly NotebookWithPages[],
): string[] {
  const validPageIds = new Set(
    notebooks.flatMap((notebook) => notebook.pages.map((page) => page.id)),
  );
  const next = appState.notebookContextPageIds.filter((id) =>
    validPageIds.has(id)
  );
  if (
    next.length === appState.notebookContextPageIds.length &&
    next.every((id, index) => id === appState.notebookContextPageIds[index])
  ) {
    return appState.notebookContextPageIds;
  }
  return setNotebookContextPageIds(appState, next);
}
