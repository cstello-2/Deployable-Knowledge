import type { AppState } from "$lib/state.svelte";
import type { NotebookWithPages } from "$lib/server/database/schema";

export const NOTEBOOK_CONTEXT_STORAGE_KEY = "dk:notebook-context-pages";
export const NOTEBOOK_CONTEXT_CHANGED_EVENT = "dk:notebook-context-changed";

export type NotebookContextChangedDetail = {
  notebookIds: string[];
  pageIds: string[];
};

export type NotebookContextSelection = {
  notebookIds: string[];
  pageIds: string[];
};

export type NotebookContextCoverage = "none" | "partial" | "all";

export function getNotebookContextSelectionSnapshot(
  appState: AppState,
): NotebookContextSelection {
  return {
    notebookIds: [...appState.notebookContextNotebookIds],
    pageIds: [...appState.notebookContextPageIds],
  };
}

function normalizeIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function canonicalizeSelection(
  appState: AppState,
  selection: NotebookContextSelection,
): NotebookContextSelection {
  const notebookIds = normalizeIds(selection.notebookIds);
  const selectedNotebookIds = new Set(notebookIds);
  const pageIds = normalizeIds(selection.pageIds).filter((pageId) => {
    const notebook = appState.notebooks.find((candidate) =>
      candidate.pages.some((page) => page.id === pageId)
    );
    return !notebook || !selectedNotebookIds.has(notebook.id);
  });
  return { notebookIds, pageIds };
}

function persistSelection(selection: NotebookContextSelection) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      NOTEBOOK_CONTEXT_STORAGE_KEY,
      JSON.stringify(selection),
    );
  } catch {
    // Context selection remains available for the current browser session.
  }
}

function notifySelection(selection: NotebookContextSelection) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NotebookContextChangedDetail>(
    NOTEBOOK_CONTEXT_CHANGED_EVENT,
    {
      detail: {
        notebookIds: [...selection.notebookIds],
        pageIds: [...selection.pageIds],
      },
    },
  ));
}

export function setNotebookContextSelection(
  appState: AppState,
  selection: {
    notebookIds?: readonly string[];
    pageIds?: readonly string[];
  },
): NotebookContextSelection {
  if (appState.assistantRequestInFlight) {
    return getNotebookContextSelectionSnapshot(appState);
  }

  const next = canonicalizeSelection(appState, {
    notebookIds: [...(selection.notebookIds ?? [])],
    pageIds: [...(selection.pageIds ?? [])],
  });
  appState.notebookContextNotebookIds = next.notebookIds;
  appState.notebookContextPageIds = next.pageIds;
  persistSelection(next);
  notifySelection(next);
  return next;
}

export function setNotebookContextPageIds(
  appState: AppState,
  pageIds: readonly string[],
): string[] {
  return setNotebookContextSelection(appState, {
    notebookIds: appState.notebookContextNotebookIds,
    pageIds,
  }).pageIds;
}

export function restoreNotebookContextPageIds(appState: AppState): string[] {
  if (typeof localStorage === "undefined") return appState.notebookContextPageIds;
  try {
    const stored = JSON.parse(
      localStorage.getItem(NOTEBOOK_CONTEXT_STORAGE_KEY) ?? "[]",
    );
    const selection = Array.isArray(stored)
      ? {
          notebookIds: [],
          pageIds: stored.filter(
            (value): value is string => typeof value === "string",
          ),
        }
      : {
          notebookIds: Array.isArray(stored?.notebookIds)
            ? stored.notebookIds.filter(
                (value: unknown): value is string => typeof value === "string",
              )
            : [],
          pageIds: Array.isArray(stored?.pageIds)
            ? stored.pageIds.filter(
                (value: unknown): value is string => typeof value === "string",
              )
            : [],
        };
    return setNotebookContextSelection(appState, selection).pageIds;
  } catch {
    return setNotebookContextSelection(appState, {
      notebookIds: [],
      pageIds: [],
    }).pageIds;
  }
}

export function pageProvidesNotebookContext(
  appState: AppState,
  pageId: string,
): boolean {
  if (appState.notebookContextPageIds.includes(pageId)) return true;
  const notebook = appState.notebooks.find((candidate) =>
    candidate.pages.some((page) => page.id === pageId)
  );
  return Boolean(
    notebook && appState.notebookContextNotebookIds.includes(notebook.id),
  );
}

export function notebookContextCoverage(
  appState: AppState,
  notebook: NotebookWithPages,
): NotebookContextCoverage {
  if (appState.notebookContextNotebookIds.includes(notebook.id)) return "all";
  const selectedPageCount = notebook.pages.filter((page) =>
    appState.notebookContextPageIds.includes(page.id)
  ).length;
  if (!selectedPageCount) return "none";
  return selectedPageCount === notebook.pages.length ? "all" : "partial";
}

export function notebookProvidesContext(
  appState: AppState,
  notebook: NotebookWithPages,
): boolean {
  return notebookContextCoverage(appState, notebook) === "all";
}

export function toggleNotebookContextPage(
  appState: AppState,
  pageId: string,
): NotebookContextSelection {
  const notebook = appState.notebooks.find((candidate) =>
    candidate.pages.some((page) => page.id === pageId)
  );
  const notebookIsSelected = Boolean(
    notebook &&
      appState.notebookContextNotebookIds.includes(notebook.id),
  );

  if (notebook && notebookIsSelected) {
    return setNotebookContextSelection(appState, {
      notebookIds: appState.notebookContextNotebookIds.filter(
        (id) => id !== notebook.id,
      ),
      pageIds: [
        ...appState.notebookContextPageIds,
        ...notebook.pages
          .map((page) => page.id)
          .filter((id) => id !== pageId),
      ],
    });
  }

  return setNotebookContextSelection(appState, {
    notebookIds: appState.notebookContextNotebookIds,
    pageIds: appState.notebookContextPageIds.includes(pageId)
      ? appState.notebookContextPageIds.filter((id) => id !== pageId)
      : [...appState.notebookContextPageIds, pageId],
  });
}

export function toggleNotebookContextNotebook(
  appState: AppState,
  notebook: NotebookWithPages,
): NotebookContextSelection {
  const pageIds = new Set(notebook.pages.map((page) => page.id));
  const removeNotebook = notebookProvidesContext(appState, notebook);
  return setNotebookContextSelection(appState, {
    notebookIds: removeNotebook
      ? appState.notebookContextNotebookIds.filter((id) => id !== notebook.id)
      : [...appState.notebookContextNotebookIds, notebook.id],
    pageIds: appState.notebookContextPageIds.filter((id) => !pageIds.has(id)),
  });
}

export function selectAllNotebookContext(
  appState: AppState,
): NotebookContextSelection {
  return setNotebookContextSelection(appState, {
    notebookIds: appState.notebooks.map((notebook) => notebook.id),
    pageIds: [],
  });
}

export function clearNotebookContext(
  appState: AppState,
): NotebookContextSelection {
  return setNotebookContextSelection(appState, {
    notebookIds: [],
    pageIds: [],
  });
}

export function hasNotebookContextSelection(appState: AppState): boolean {
  return appState.notebookContextNotebookIds.length > 0 ||
    appState.notebookContextPageIds.length > 0;
}

export function getNotebookContextSummary(appState: AppState): string {
  const notebookCount = appState.notebookContextNotebookIds.length;
  const pageCount = appState.notebookContextPageIds.length;
  if (!notebookCount && !pageCount) return "No notebook context selected.";

  const notebookText = notebookCount
    ? `${notebookCount} ${notebookCount === 1 ? "notebook" : "notebooks"}`
    : "";
  const pageText = pageCount
    ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}`
    : "";
  return `Using context from ${[notebookText, pageText].filter(Boolean).join(" and ")}.`;
}

export function pruneNotebookContextPageIds(
  appState: AppState,
  notebooks: readonly NotebookWithPages[],
): NotebookContextSelection {
  const validNotebookIds = new Set(notebooks.map((notebook) => notebook.id));
  const validPageIds = new Set(
    notebooks.flatMap((notebook) => notebook.pages.map((page) => page.id)),
  );
  const next = canonicalizeSelection(appState, {
    notebookIds: appState.notebookContextNotebookIds.filter((id) =>
      validNotebookIds.has(id)
    ),
    pageIds: appState.notebookContextPageIds.filter((id) =>
      validPageIds.has(id)
    ),
  });
  if (
    next.notebookIds.length === appState.notebookContextNotebookIds.length &&
    next.notebookIds.every(
      (id, index) => id === appState.notebookContextNotebookIds[index],
    ) &&
    next.pageIds.length === appState.notebookContextPageIds.length &&
    next.pageIds.every(
      (id, index) => id === appState.notebookContextPageIds[index],
    )
  ) {
    return next;
  }
  return setNotebookContextSelection(appState, next);
}
