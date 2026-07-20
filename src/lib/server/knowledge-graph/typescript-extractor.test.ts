import assert from "node:assert/strict";
import test from "node:test";
import { BASE_ENTITY_LABELS } from "./gliner-extractor";
import { extractWithTypeScript } from "./typescript-extractor";

test("TypeScript extractor does not promote classification labels into graph entities", () => {
  const result = extractWithTypeScript(
    "TCCC guidance says tourniquets control massive hemorrhage during tactical field care. CoTCCC and TCCC Working Group update treatment guidance.",
    BASE_ENTITY_LABELS,
    "chunk-1",
  );

  const labels = result.entities.map((entity) => entity.label.toLowerCase());
  assert.ok(labels.includes("tccc"));
  assert.ok(labels.some((label) => label.includes("tourniquet")));
  assert.ok(labels.some((label) => label.includes("hemorrhage")));
  assert.equal(labels.includes("unknown"), false);
  assert.equal(labels.includes("person"), false);
  assert.equal(labels.includes("date"), false);
  assert.equal(labels.includes("cotccc and"), false);

  const tourniquet = result.entities.find((entity) => entity.label.toLowerCase().includes("tourniquet"));
  assert.equal(tourniquet?.kind, "treatment");
});

test("TypeScript extractor filters document-heading uppercase noise", () => {
  const result = extractWithTypeScript(
    "TACTICAL COMBAT CASUALTY CARE HANDBOOK. MARCH begins with massive hemorrhage control and airway management.",
    BASE_ENTITY_LABELS,
    "chunk-2",
  );

  const labels = result.entities.map((entity) => entity.label.toLowerCase());
  assert.ok(labels.includes("march"));
  assert.ok(labels.some((label) => label.includes("massive hemorrhage")));
  assert.equal(labels.includes("tactical"), false);
  assert.equal(labels.includes("combat"), false);
  assert.equal(labels.includes("casualty"), false);
  assert.equal(labels.includes("care"), false);
  assert.equal(labels.includes("handbook"), false);
});
