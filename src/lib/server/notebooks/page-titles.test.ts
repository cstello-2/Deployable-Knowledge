import assert from "node:assert/strict";
import test from "node:test";
import { uniqueNotebookPageTitle } from "./page-titles.ts";

test("keeps an available notebook page title", () => {
  assert.equal(
    uniqueNotebookPageTitle("Findings", ["Overview", "Sources"]),
    "Findings",
  );
});

test("adds the next available suffix for duplicate page titles", () => {
  assert.equal(
    uniqueNotebookPageTitle("Findings", [
      "findings",
      "Findings (2)",
      "FINDINGS (3)",
    ]),
    "Findings (4)",
  );
});
