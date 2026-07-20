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

test("query labels are added only to chunks that actually contain them", () => {
  const unrelated = extractWithTypeScript(
    "This paragraph discusses airway management without naming the requested protocol.",
    ["MARCH"],
    "chunk-unrelated",
  );
  assert.equal(
    unrelated.entities.some((entity) => entity.label === "MARCH"),
    false,
  );

  const matching = extractWithTypeScript(
    "The MARCH acronym begins with massive hemorrhage.",
    ["MARCH"],
    "chunk-matching",
  );
  assert.equal(
    matching.entities.some((entity) => entity.label === "MARCH"),
    true,
  );
});

test("uppercase acronym labels do not match title-case month names", () => {
  const result = extractWithTypeScript(
    "The publication date is 1 March 2009.",
    ["MARCH"],
    "chunk-date",
  );

  assert.equal(
    result.entities.some((entity) => entity.label.toLowerCase() === "march"),
    false,
  );
});

test("question words are not promoted into graph entities", () => {
  const result = extractWithTypeScript(
    "What does MARCH stand for?",
    BASE_ENTITY_LABELS,
  );
  const labels = result.entities.map((entity) => entity.label);

  assert.ok(labels.includes("MARCH"));
  assert.equal(labels.includes("What"), false);
});
