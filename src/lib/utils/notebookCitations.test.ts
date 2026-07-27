import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNotebookCitation,
  insertNotebookCitation,
} from "./notebookCitations.ts";

test("formats a linked PDF page citation", () => {
  assert.equal(
    formatNotebookCitation({
      documentId: "document 123",
      documentTitle: "Command [and] Control",
      pageIndex: 4,
      sourceType: "PDF",
    }),
    "([Command \\[and\\] Control, p. 5](/document-files/document%20123#page=5))",
  );
});

test("inserts a citation at the current selection with readable spacing", () => {
  assert.deepEqual(
    insertNotebookCitation(
      "Read this source today.",
      "([Source, p. 2](/source#page=2))",
      10,
      16,
    ),
    {
      text: "Read this ([Source, p. 2](/source#page=2)) today.",
      cursor: 42,
    },
  );
});
