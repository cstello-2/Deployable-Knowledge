import assert from "node:assert/strict";
import test from "node:test";
import type { NotebookWithPages } from "$lib/server/database/schema";
import {
  createNotebookSearchSnippet,
  searchNotebookPages,
} from "./notebookSearch.ts";

const notebooks = [
  {
    id: "notebook-1",
    title: "Cancun Research",
    activePageId: "page-1",
    pages: [
      {
        id: "page-1",
        title: "Command and Control",
        content: "C2 enables commanders to coordinate forces and decisions.",
      },
      {
        id: "page-2",
        title: "Sources",
        content: "A bibliography of supporting documents.",
      },
    ],
  },
  {
    id: "notebook-2",
    title: "Other Notes",
    activePageId: "page-3",
    pages: [
      {
        id: "page-3",
        title: "Decision Advantage",
        content: "Timely command information supports decision advantage.",
      },
    ],
  },
] as NotebookWithPages[];

test("searches titles and content across notebooks", () => {
  const results = searchNotebookPages(notebooks, "command decision");

  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((result) => result.pageId).sort(),
    ["page-1", "page-3"],
  );
  assert.match(
    results.find((result) => result.pageId === "page-3")?.snippet ?? "",
    /command information/i,
  );
});

test("requires every entered keyword to match the result", () => {
  assert.deepEqual(searchNotebookPages(notebooks, "bibliography command"), []);
});

test("centers snippets near the first keyword", () => {
  const snippet = createNotebookSearchSnippet(
    `${"Beginning text ".repeat(20)}target phrase at the end.`,
    ["target"],
    80,
  );

  assert.match(snippet, /^\.\.\./);
  assert.match(snippet, /target phrase/);
});
