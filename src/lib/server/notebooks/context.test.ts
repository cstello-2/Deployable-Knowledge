import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveNotebookContextRows,
  type NotebookContextRow,
} from "./context";

const rows: NotebookContextRow[] = [
  {
    notebookId: "notebook-1",
    notebookTitle: "Notebook 1",
    pageId: "page-1",
    pageTitle: "Page 1",
    pageContent: "First notebook, first page.",
  },
  {
    notebookId: "notebook-1",
    notebookTitle: "Notebook 1",
    pageId: "page-2",
    pageTitle: "Page 2",
    pageContent: "First notebook, second page.",
  },
  {
    notebookId: "notebook-2",
    notebookTitle: "Notebook 2",
    pageId: "page-3",
    pageTitle: "Page 3",
    pageContent: "Second notebook, selected page.",
  },
  {
    notebookId: "notebook-2",
    notebookTitle: "Notebook 2",
    pageId: "page-4",
    pageTitle: "Page 4",
    pageContent: "Second notebook, unselected page.",
  },
];

test("whole notebook IDs include every page in that notebook only", () => {
  const result = resolveNotebookContextRows(
    rows,
    ["notebook-1"],
    [],
  );

  assert.deepEqual(result.notebookIds, ["notebook-1"]);
  assert.deepEqual(result.pageIds, []);
  assert.deepEqual(
    result.pages.map((page) => page.pageId),
    ["page-1", "page-2"],
  );
  assert.match(result.context, /First notebook, first page/);
  assert.match(result.context, /First notebook, second page/);
  assert.doesNotMatch(result.context, /Second notebook/);
});

test("individual page IDs include only those pages", () => {
  const result = resolveNotebookContextRows(rows, [], ["page-3"]);

  assert.deepEqual(result.notebookIds, []);
  assert.deepEqual(result.pageIds, ["page-3"]);
  assert.deepEqual(
    result.pages.map((page) => page.pageId),
    ["page-3"],
  );
  assert.match(result.context, /Second notebook, selected page/);
  assert.doesNotMatch(result.context, /unselected page/);
});

test("mixed selections deduplicate pages covered by a whole notebook", () => {
  const result = resolveNotebookContextRows(
    rows,
    ["notebook-1"],
    ["page-2", "page-3"],
  );

  assert.deepEqual(result.notebookIds, ["notebook-1"]);
  assert.deepEqual(result.pageIds, ["page-3"]);
  assert.deepEqual(
    result.pages.map((page) => page.pageId),
    ["page-1", "page-2", "page-3"],
  );
  assert.doesNotMatch(result.context, /unselected page/);
});

test("select all includes every available notebook and page", () => {
  const result = resolveNotebookContextRows(
    rows,
    ["notebook-1", "notebook-2"],
    [],
  );

  assert.deepEqual(result.notebookIds, ["notebook-1", "notebook-2"]);
  assert.deepEqual(
    result.pages.map((page) => page.pageId),
    ["page-1", "page-2", "page-3", "page-4"],
  );
});

test("unknown or deselected IDs do not contribute context", () => {
  const unknown = resolveNotebookContextRows(
    rows,
    ["missing-notebook"],
    ["missing-page"],
  );
  const empty = resolveNotebookContextRows(rows, [], []);

  assert.deepEqual(unknown, {
    context: "",
    notebookIds: [],
    pageIds: [],
    pages: [],
  });
  assert.deepEqual(empty, unknown);
});
