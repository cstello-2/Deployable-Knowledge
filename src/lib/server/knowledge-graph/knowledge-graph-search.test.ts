import assert from "node:assert/strict";
import test from "node:test";
import { acronymDefinitionBoost } from "./knowledge-graph-search";

test("acronym definition evidence outranks incidental acronym text", () => {
  const query = "What does MARCH stand for?";

  assert.equal(
    acronymDefinitionBoost(
      query,
      "MARCH (massive hemorrhage, airway, respirations, circulation, head injury/hypothermia)",
    ),
    1,
  );
  assert.equal(
    acronymDefinitionBoost(query, "Roadmap updated in March (U) for the program office."),
    0,
  );
});
