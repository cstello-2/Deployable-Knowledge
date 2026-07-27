import assert from "node:assert/strict";
import test from "node:test";
import { reorderItemsById } from "./layoutPresetOrder";

const layouts = [
  { id: "one" },
  { id: "two" },
  { id: "three" },
];

test("moves a layout after a later tab", () => {
  assert.deepEqual(
    reorderItemsById(layouts, "one", "three", "after").map(({ id }) => id),
    ["two", "three", "one"],
  );
});

test("moves a layout before an earlier tab", () => {
  assert.deepEqual(
    reorderItemsById(layouts, "three", "one", "before").map(({ id }) => id),
    ["three", "one", "two"],
  );
});

test("keeps the order when a layout ID is unavailable", () => {
  assert.deepEqual(
    reorderItemsById(layouts, "missing", "one", "before"),
    layouts,
  );
});
