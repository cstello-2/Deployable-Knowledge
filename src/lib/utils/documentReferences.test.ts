import assert from "node:assert/strict";
import test from "node:test";
import { documentPdfPageUrl } from "./documentReferences.ts";

test("builds an encoded PDF URL at the one-based page number", () => {
  assert.equal(
    documentPdfPageUrl("document 123", 4),
    "/document-files/document%20123#page=5",
  );
});

test("never creates a PDF page below page one", () => {
  assert.equal(documentPdfPageUrl("document", -9), "/document-files/document#page=1");
});
