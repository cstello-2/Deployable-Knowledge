import assert from "node:assert/strict";
import test from "node:test";
import type { NotebookWithPages } from "$lib/server/database/schema";
import type { AppState } from "$lib/state.svelte";
import {
  getNotebookContextSummary,
  pageProvidesNotebookContext,
  pruneNotebookContextPageIds,
  selectAllNotebookContext,
  setNotebookContextSelection,
  toggleNotebookContextNotebook,
  toggleNotebookContextPage,
} from "./notebookContextSelection";

function notebook(
  id: string,
  title: string,
  pageIds: string[],
): NotebookWithPages {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return {
    id,
    userId: "default",
    title,
    activePageId: pageIds[0] ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    pages: pageIds.map((pageId, index) => ({
      id: pageId,
      notebookId: id,
      title: `Page ${index + 1}`,
      content: `Content ${pageId}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  };
}

function state(notebooks: NotebookWithPages[]): AppState {
  return {
    notebooks,
    notebookContextNotebookIds: [],
    notebookContextPageIds: [],
  } as unknown as AppState;
}

test("whole notebook selection resolves all of its pages", () => {
  const first = notebook("notebook-1", "Notebook 1", ["page-1", "page-2"]);
  const appState = state([first]);

  toggleNotebookContextNotebook(appState, first);

  assert.deepEqual(appState.notebookContextNotebookIds, ["notebook-1"]);
  assert.deepEqual(appState.notebookContextPageIds, []);
  assert.equal(pageProvidesNotebookContext(appState, "page-1"), true);
  assert.equal(pageProvidesNotebookContext(appState, "page-2"), true);
  assert.equal(getNotebookContextSummary(appState), "Using context from 1 notebook.");
});

test("deselecting one page from a whole notebook keeps the remaining pages", () => {
  const first = notebook("notebook-1", "Notebook 1", ["page-1", "page-2"]);
  const appState = state([first]);
  toggleNotebookContextNotebook(appState, first);

  toggleNotebookContextPage(appState, "page-1");

  assert.deepEqual(appState.notebookContextNotebookIds, []);
  assert.deepEqual(appState.notebookContextPageIds, ["page-2"]);
  assert.equal(pageProvidesNotebookContext(appState, "page-1"), false);
  assert.equal(pageProvidesNotebookContext(appState, "page-2"), true);
});

test("mixed notebook and page selections retain distinct IDs and summary counts", () => {
  const first = notebook("notebook-1", "Notebook 1", ["page-1", "page-2"]);
  const second = notebook("notebook-2", "Notebook 2", ["page-3", "page-4"]);
  const appState = state([first, second]);

  setNotebookContextSelection(appState, {
    notebookIds: ["notebook-1"],
    pageIds: ["page-2", "page-3"],
  });

  assert.deepEqual(appState.notebookContextNotebookIds, ["notebook-1"]);
  assert.deepEqual(appState.notebookContextPageIds, ["page-3"]);
  assert.equal(
    getNotebookContextSummary(appState),
    "Using context from 1 notebook and 1 page.",
  );
});

test("select all uses every notebook as the canonical selection", () => {
  const appState = state([
    notebook("notebook-1", "Notebook 1", ["page-1"]),
    notebook("notebook-2", "Notebook 2", ["page-2"]),
  ]);

  selectAllNotebookContext(appState);

  assert.deepEqual(
    appState.notebookContextNotebookIds,
    ["notebook-1", "notebook-2"],
  );
  assert.deepEqual(appState.notebookContextPageIds, []);
  assert.equal(
    getNotebookContextSummary(appState),
    "Using context from 2 notebooks.",
  );
});

test("deleted notebooks and pages are pruned from shared context state", () => {
  const first = notebook("notebook-1", "Notebook 1", ["page-1"]);
  const second = notebook("notebook-2", "Notebook 2", ["page-2"]);
  const appState = state([first, second]);
  setNotebookContextSelection(appState, {
    notebookIds: ["notebook-1"],
    pageIds: ["page-2"],
  });
  appState.notebooks = [second];

  pruneNotebookContextPageIds(appState, [second]);

  assert.deepEqual(appState.notebookContextNotebookIds, []);
  assert.deepEqual(appState.notebookContextPageIds, ["page-2"]);
});
