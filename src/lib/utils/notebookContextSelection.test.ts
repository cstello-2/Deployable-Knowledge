import assert from "node:assert/strict";
import test from "node:test";
import type { NotebookWithPages } from "$lib/server/database/schema";
import type { AppState } from "$lib/state.svelte";
import {
  clearNotebookContext,
  getNotebookContextSelectionSnapshot,
  getNotebookContextSummary,
  notebookContextCoverage,
  pageProvidesNotebookContext,
  pruneNotebookContextPageIds,
  removeNotebookContext,
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
    assistantRequestInFlight: false,
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

test("notebook coverage is active only when every page provides context", () => {
  const first = notebook("notebook-1", "Notebook 1", ["page-1", "page-2"]);
  const appState = state([first]);

  toggleNotebookContextPage(appState, "page-1");
  assert.equal(notebookContextCoverage(appState, first), "partial");

  toggleNotebookContextPage(appState, "page-2");
  assert.equal(notebookContextCoverage(appState, first), "all");

  toggleNotebookContextPage(appState, "page-1");
  assert.equal(notebookContextCoverage(appState, first), "partial");
});

test("deactivating a notebook removes its whole and partial context only", () => {
  const first = notebook("notebook-1", "Notebook 1", ["page-1", "page-2"]);
  const second = notebook("notebook-2", "Notebook 2", ["page-3"]);
  const appState = state([first, second]);
  setNotebookContextSelection(appState, {
    notebookIds: ["notebook-2"],
    pageIds: ["page-1", "page-2"],
  });

  removeNotebookContext(appState, first);

  assert.deepEqual(appState.notebookContextNotebookIds, ["notebook-2"]);
  assert.deepEqual(appState.notebookContextPageIds, []);
  assert.equal(notebookContextCoverage(appState, first), "none");
  assert.equal(notebookContextCoverage(appState, second), "all");
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

test("request snapshots remain unchanged when live selection changes later", () => {
  const first = notebook("notebook-1", "Notebook 1", ["page-1", "page-2"]);
  const appState = state([first]);
  setNotebookContextSelection(appState, {
    notebookIds: [],
    pageIds: ["page-1"],
  });

  const snapshot = getNotebookContextSelectionSnapshot(appState);
  toggleNotebookContextPage(appState, "page-2");

  assert.deepEqual(snapshot, {
    notebookIds: [],
    pageIds: ["page-1"],
  });
  assert.deepEqual(appState.notebookContextPageIds, ["page-1", "page-2"]);
});

test("shared context selection cannot change while an assistant request is active", () => {
  const first = notebook("notebook-1", "Notebook 1", ["page-1", "page-2"]);
  const appState = state([first]);
  setNotebookContextSelection(appState, {
    notebookIds: [],
    pageIds: ["page-1"],
  });
  appState.assistantRequestInFlight = true;

  toggleNotebookContextPage(appState, "page-2");
  toggleNotebookContextNotebook(appState, first);
  clearNotebookContext(appState);

  assert.deepEqual(getNotebookContextSelectionSnapshot(appState), {
    notebookIds: [],
    pageIds: ["page-1"],
  });
});

test("context selection changes normally after assistant processing ends", () => {
  const first = notebook("notebook-1", "Notebook 1", ["page-1"]);
  const appState = state([first]);
  appState.assistantRequestInFlight = true;
  toggleNotebookContextPage(appState, "page-1");
  assert.deepEqual(appState.notebookContextPageIds, []);

  appState.assistantRequestInFlight = false;
  toggleNotebookContextPage(appState, "page-1");
  assert.deepEqual(appState.notebookContextPageIds, ["page-1"]);
});

test("reading historical message metadata does not overwrite future context selection", () => {
  const first = notebook("notebook-1", "Notebook 1", ["page-1", "page-2"]);
  const appState = state([first]);
  setNotebookContextSelection(appState, {
    notebookIds: [],
    pageIds: ["page-2"],
  });
  const historicalMetadata = {
    notebookContextNotebookIds: ["notebook-1"],
    notebookContextPageIds: [],
  };

  // Historical metadata is display-only; reading it must not be applied to the
  // shared selection used by the next request.
  assert.deepEqual(historicalMetadata.notebookContextNotebookIds, ["notebook-1"]);
  assert.deepEqual(getNotebookContextSelectionSnapshot(appState), {
    notebookIds: [],
    pageIds: ["page-2"],
  });
});
