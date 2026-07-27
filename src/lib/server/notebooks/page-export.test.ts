import assert from "node:assert/strict";
import test from "node:test";
import { PDFParse } from "pdf-parse";
import {
  notebookMarkdown,
  notebookPageExportFilename,
  notebookPageMarkdown,
  notebookPagePdf,
  notebookPdf,
} from "./page-export.ts";

const page = {
  notebookTitle: "Research Notes",
  pageTitle: "Command & Control",
  content: "## Summary\n\n- First finding\n- Second finding",
};

test("exports a titled Markdown document", () => {
  assert.equal(
    notebookPageMarkdown(page),
    "# Command & Control\n\n## Summary\n\n- First finding\n- Second finding\n",
  );
  assert.equal(
    notebookPageExportFilename(page.pageTitle, "md"),
    "Command-Control.md",
  );
});

test("exports a readable single-page PDF", async () => {
  const pdf = await notebookPagePdf(page);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");

  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const result = await parser.getText();
    assert.equal(result.total, 1);
    assert.match(result.text, /Command & Control/);
    assert.match(result.text, /First finding/);
    assert.match(result.text, /1 of 1/);
  } finally {
    await parser.destroy();
  }
});

test("exports selected notebook pages as one Markdown document", () => {
  assert.equal(
    notebookMarkdown({
      notebookTitle: "Research Notes",
      pages: [
        { pageTitle: "Page One", content: "First page." },
        { pageTitle: "Page Three", content: "Third page." },
      ],
    }),
    [
      "# Research Notes",
      "",
      "## Page One",
      "",
      "First page.",
      "",
      "---",
      "",
      "## Page Three",
      "",
      "Third page.",
      "",
    ].join("\n"),
  );
});

test("starts each selected notebook page on a fresh PDF page", async () => {
  const pdf = await notebookPdf({
    notebookTitle: "Research Notes",
    pages: [
      { pageTitle: "Page One", content: "First page." },
      { pageTitle: "Page Three", content: "Third page." },
    ],
  });
  const parser = new PDFParse({ data: new Uint8Array(pdf) });

  try {
    const result = await parser.getText();
    assert.equal(result.total, 2);
    assert.match(result.getPageText(1), /Page One/);
    assert.match(result.getPageText(1), /First page/);
    assert.match(result.getPageText(2), /Page Three/);
    assert.match(result.getPageText(2), /Third page/);
  } finally {
    await parser.destroy();
  }
});
