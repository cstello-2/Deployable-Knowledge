import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanPageText,
  splitSentencesWithOffsets,
  startsStructuralBlock,
} from "./chunker-semantic";

test("cleanPageText removes page-number-only lines and trims short label suffix numbers", () => {
  const input = [
    "12",
    "Medication Administration 14",
    "Normal prose line 14.",
    "Warning: Airway Check 2",
  ].join("\n");

  assert.equal(
    cleanPageText(input),
    [
      "Medication Administration",
      "Normal prose line 14.",
      "Warning: Airway Check",
    ].join("\n"),
  );
});

test("cleanPageText normalizes noisy bullet prefixes", () => {
  const input = [
    "* * First bullet item stays together.",
    "* •• Second bullet item also stays together.",
  ].join("\n");

  assert.equal(
    cleanPageText(input),
    [
      "* First bullet item stays together.",
      "* Second bullet item also stays together.",
    ].join("\n"),
  );
});

test("startsStructuralBlock uses line shape instead of anchor words", () => {
  assert.equal(startsStructuralBlock("Medication Administration"), true);
  assert.equal(startsStructuralBlock("Warning: Airway Check"), true);
  assert.equal(startsStructuralBlock("3. Secure the airway"), true);
  assert.equal(startsStructuralBlock("The casualty was moved to cover."), false);
});

test("splitSentencesWithOffsets keeps abbreviations and decimals intact", () => {
  const spans = splitSentencesWithOffsets(
    "Dr. Smith administered 3.5 liters. Then Capt. Jones reassessed the patient.",
  );

  assert.deepEqual(
    spans.map((span: { text: string }) => span.text),
    [
      "Dr. Smith administered 3.5 liters.",
      "Then Capt. Jones reassessed the patient.",
    ],
  );
});

test("splitSentencesWithOffsets keeps structural lines as standalone spans", () => {
  const spans = splitSentencesWithOffsets(
    [
      "Warning: Airway Check",
      "The casualty was moved to cover.",
      "* First bullet item stays together.",
    ].join("\n"),
  );

  assert.deepEqual(
    spans.map((span: { text: string; startsBlock: boolean }) => ({
      text: span.text,
      startsBlock: span.startsBlock,
    })),
    [
      { text: "Warning: Airway Check", startsBlock: true },
      { text: "The casualty was moved to cover.", startsBlock: false },
      { text: "* First bullet item stays together.", startsBlock: true },
    ],
  );
});
