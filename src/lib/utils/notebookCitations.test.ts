import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNotebookCitation,
  insertNotebookCitation,
  insertNotebookSourceCitation,
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

test("adds an inline citation and a linked table row at the page bottom", () => {
  const result = insertNotebookSourceCitation(
    "Operational notes.",
    {
      documentId: "document 123",
      documentTitle: "Command | Control",
      pageIndex: 4,
      sourceType: "PDF",
    },
    11,
    11,
  );

  assert.equal(
    result.text,
    [
      "Operational ([Command | Control, p. 5](/document-files/document%20123#page=5)) notes.",
      "",
      "## Citations",
      "",
      "| Source | Page | Type |",
      "| --- | ---: | --- |",
      "| [Command \\| Control](/document-files/document%20123#page=5) | 5 | PDF |",
    ].join("\n"),
  );
  assert.equal(result.cursor, 78);
});

test("does not duplicate a source page in the citations table", () => {
  const source = {
    documentId: "document-1",
    documentTitle: "Source",
    pageIndex: 1,
    sourceType: "PDF" as const,
  };
  const first = insertNotebookSourceCitation("Notes", source, 5, 5);
  const second = insertNotebookSourceCitation(first.text, source, 5, 5);

  assert.equal(
    second.text.match(
      /^\| \[Source\]\(\/document-files\/document-1#page=2\) \| 2 \| PDF \|$/gm,
    )?.length,
    1,
  );
});

test("keeps the citations table last when content was added after it", () => {
  const source = {
    documentId: "notebook-source",
    documentTitle: "Research Notes",
    pageIndex: 0,
    sourceType: "NOTEBOOK" as const,
  };
  const first = insertNotebookSourceCitation("First paragraph.", source);
  const withLaterText = `${first.text}\n\nLater paragraph.`;
  const result = insertNotebookSourceCitation(
    withLaterText,
    {
      documentId: "document-2",
      documentTitle: "Field Guide",
      pageIndex: 2,
      sourceType: "PDF",
    },
    withLaterText.length,
  );

  assert.ok(result.text.indexOf("Later paragraph.") < result.text.indexOf("## Citations"));
  assert.ok(result.text.endsWith(
    "| [Field Guide](/document-files/document-2#page=3) | 3 | PDF |",
  ));
});
