import assert from "node:assert/strict";
import test from "node:test";
import { buildNotebookCorpusChunks } from "./master-corpus-chunks.ts";

test("builds searchable notebook chunks with stable corpus identity", () => {
  const chunks = buildNotebookCorpusChunks({
    notebookId: "notebook-123",
    notebookTitle: "Cancun Notes",
    pages: [
      {
        title: "Page One",
        content:
          "Command and control connects commanders with forces across multiple domains.",
        pageIndex: 0,
      },
      {
        title: "Page Two",
        content: "",
        pageIndex: 1,
      },
      {
        title: "Page Three",
        content:
          "Decision advantage depends on timely context and trustworthy information.",
        pageIndex: 2,
      },
    ],
  });

  assert.ok(chunks.length >= 2);
  assert.deepEqual(
    [...new Set(chunks.map((chunk) => chunk.pageIndex))],
    [0, 2],
  );
  assert.ok(chunks.every((chunk) => chunk.source.type === "NOTEBOOK"));
  assert.ok(
    chunks.every(
      (chunk) => chunk.source.path === "notebook:notebook-123",
    ),
  );
  assert.match(chunks[0].content, /Notebook: Cancun Notes/);
  assert.match(chunks[0].content, /Notebook page: Page One/);
});

test("does not create corpus chunks for empty selected pages", () => {
  const chunks = buildNotebookCorpusChunks({
    notebookId: "notebook-123",
    notebookTitle: "Empty Notes",
    pages: [{ title: "Page One", content: "   ", pageIndex: 0 }],
  });

  assert.deepEqual(chunks, []);
});
