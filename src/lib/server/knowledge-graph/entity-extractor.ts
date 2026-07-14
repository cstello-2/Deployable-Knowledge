// Entity extraction is intentionally transparent: known domain terms get useful types,
// while acronyms and proper names provide coverage for manuals not yet in the dictionary.

import type { EntityKind } from "./types";
import { normalizeLabel } from "./utils";

export type ExtractedEntity = {
  label: string;
  kind: EntityKind;
};

const DOMAIN_ENTITIES: Record<string, EntityKind> = {
  MARCH: "protocol",
  TCCC: "protocol",
  "Tactical Combat Casualty Care": "protocol",
  "massive hemorrhage": "condition",
  hemorrhage: "condition",
  airway: "concept",
  respiration: "concept",
  circulation: "concept",
  hypothermia: "condition",
  tourniquet: "treatment",
  tourniquets: "treatment",
  "needle decompression": "treatment",
  "tension pneumothorax": "condition",
  "United States Air Force": "organization",
  "Department of the Air Force": "organization",
  "Air Combat Command": "organization",
  "Air Education and Training Command": "organization",
  "dress and appearance": "concept",
  uniform: "concept",
  commander: "concept",
  Radar: "technology",
  radar: "technology",
  "radio waves": "technology",
  transmitter: "system",
  antenna: "system",
  receiver: "system",
  "signal processor": "system",
};

const STOP_LABELS = new Set([
  "the", "and", "that", "this", "with", "from", "into", "they", "their", "used",
  "before", "after", "which", "what", "where", "when", "also", "chapter", "section",
  "table", "figure", "attachment", "department", "purpose", "scope", "references",
]);

export function extractEntities(text: string): ExtractedEntity[] {
  const found: ExtractedEntity[] = [];
  const lower = text.toLowerCase();

  // Known phrases are checked case-insensitively so PDF capitalization does not matter.
  for (const [term, kind] of Object.entries(DOMAIN_ENTITIES)) {
    if (lower.includes(term.toLowerCase())) {
      found.push({ label: normalizeLabel(term), kind });
    }
  }

  // Acronyms connect repeated military, medical, and technical abbreviations across chunks.
  for (const acronym of text.match(/\b[A-Z][A-Z0-9-]{1,12}\b/g) ?? []) {
    if (!STOP_LABELS.has(acronym.toLowerCase())) {
      found.push({ label: acronym, kind: DOMAIN_ENTITIES[acronym] ?? "unknown" });
    }
  }

  // Proper-name phrases provide organization and named-concept coverage without an LLM call.
  for (const phrase of text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}\b/g) ?? []) {
    if (!STOP_LABELS.has(phrase.toLowerCase())) {
      found.push({ label: normalizeLabel(phrase), kind: DOMAIN_ENTITIES[phrase] ?? "unknown" });
    }
  }

  const byLabel = new Map<string, ExtractedEntity>();
  for (const entity of found) byLabel.set(entity.label.toLowerCase(), entity);
  return [...byLabel.values()];
}
