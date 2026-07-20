import assert from "node:assert/strict";
import test from "node:test";
import { resolveRagRetrievalMode } from "./retrieve-rag-context";

test("the mode sent by Assistant Chat takes precedence", () => {
  assert.equal(resolveRagRetrievalMode("graph", "hybrid"), "graph");
});

test("legacy settings are used when no request or profile mode exists", () => {
  assert.equal(resolveRagRetrievalMode(undefined, undefined, "graph"), "graph");
});

test("invalid or missing modes safely fall back to hybrid", () => {
  assert.equal(resolveRagRetrievalMode("kg", null), "hybrid");
});
