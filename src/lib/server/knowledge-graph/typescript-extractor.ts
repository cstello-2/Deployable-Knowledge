import { normalizeLabel, sanitizeEntityLabel, splitSentences, tokenize, unique } from "./utils";
import type { GlinerEntity, GlinerRelation } from "./gliner-extractor";
import {
  canonicalizeDictionaryEntity,
  canonicalizeDictionaryRelation,
  dictionaryEntityCandidates,
  dictionaryKindForLabel,
  entityAppearsInText,
  entityMentionIndex,
  entityMentionIndexAfter,
  entityMentionIndexBefore,
  relationEvidenceMatch,
  relationForEvidence,
} from "./dictionary";

const MAX_ENTITIES_PER_CHUNK = 18;
const MAX_RELATIONS_PER_CHUNK = 28;
const MAX_ENTITY_WORDS = 6;

// Generic language stop words are not a domain dictionary. They keep the extractor from
// turning every sentence fragment into a graph node while still letting the corpus define
// the entities that appear in the graph.
const STOP_WORDS = new Set([
  "a",
  "about",
  "above",
  "after",
  "all",
  "also",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "between",
  "but",
  "by",
  "can",
  "chapter",
  "do",
  "does",
  "during",
  "each",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "may",
  "must",
  "no",
  "not",
  "of",
  "on",
  "or",
  "other",
  "page",
  "shall",
  "should",
  "such",
  "that",
  "the",
  "their",
  "these",
  "this",
  "those",
  "through",
  "to",
  "under",
  "use",
  "used",
  "using",
  "was",
  "were",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "what",
  "with",
  "within",
  "without",
]);

const CLASSIFICATION_LABELS = new Set([
  "acronym",
  "artifact",
  "concept",
  "condition",
  "date",
  "document",
  "event",
  "location",
  "organization",
  "person",
  "protocol",
  "quantity",
  "system",
  "technology",
  "treatment",
  "unknown",
]);

const LOW_VALUE_LABELS = new Set([
  ...CLASSIFICATION_LABELS,
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "appendix",
  "article",
  "author",
  "figure",
  "fig",
  "form",
  "note",
  "record",
  "reference",
  "section",
  "table",
]);

const UPPERCASE_HEADING_WORDS = new Set([
  "ADMINISTRATION",
  "AIR",
  "APPENDIX",
  "ARMY",
  "AUTHORITY",
  "CARE",
  "CASUALTY",
  "CENTER",
  "CHAPTER",
  "COMBAT",
  "CONTENTS",
  "CONTROL",
  "FIGURE",
  "FORCE",
  "HANDBOOK",
  "INTRODUCTION",
  "LESSONS",
  "MANAGEMENT",
  "MANUAL",
  "NOTE",
  "OVERVIEW",
  "PAGE",
  "RECORD",
  "REFERENCE",
  "SECTION",
  "TACTICAL",
  "TABLE",
]);

const TRAILING_CONNECTORS = new Set(["and", "or", "of", "for", "to", "the", "with", "without"]);
const LEADING_CONNECTORS = new Set(["and", "or", "of", "for", "to", "the", "with", "without"]);
const RELATIONAL_ENTITY_TERMS = new Set([
  "authorized",
  "authorizes",
  "authorize",
  "prohibited",
  "prohibits",
  "requires",
  "required",
  "permitted",
  "permits",
  "wear",
  "wearing",
  "worn",
  "must",
  "shall",
  "may",
  "will",
]);

type Candidate = {
  label: string;
  score: number;
  kind: string;
};

export function extractWithTypeScript(
  text: string,
  labels: string[] = [],
  chunkId?: string,
): { entities: GlinerEntity[]; relations: GlinerRelation[] } {
  const entities = rankEntities(text, labels)
    .slice(0, MAX_ENTITIES_PER_CHUNK)
    .map((candidate) => ({
      label: candidate.label,
      kind: candidate.kind,
      chunkIds: chunkId ? [chunkId] : undefined,
    }));

  return {
    entities,
    relations: extractRelations(text, entities).slice(0, MAX_RELATIONS_PER_CHUNK),
  };
}

function rankEntities(text: string, queryLabels: string[] = []): Candidate[] {
  const candidates = new Map<string, Candidate>();
  const add = (label: string, score: number, kind = inferKind(label)) => {
    const initial = cleanCandidateLabel(sanitizeEntityLabel(label));
    const canonical = canonicalizeDictionaryEntity(initial);
    if (!canonical && isRelationalPhrase(initial)) return;
    const sanitized = canonical?.label ?? initial;
    kind = canonical?.kind ?? kind;
    if (!isUsefulEntity(sanitized)) return;

    const key = sanitized.toLowerCase();
    const existing = candidates.get(key);
    if (!existing || score > existing.score) {
      candidates.set(key, {
        label: sanitized,
        score: (existing?.score ?? 0) + score,
        kind: existing?.kind && existing.kind !== "concept" ? existing.kind : kind,
      });
    } else {
      existing.score += score;
      if (canonical?.kind && existing.kind === "concept") existing.kind = canonical.kind;
    }
  };

  for (const candidate of dictionaryEntityCandidates(text)) {
    add(candidate.label, candidate.score, candidate.kind);
  }

  for (const label of queryLabels) {
    if (isClassificationLabel(label)) continue;
    if (!containsQueryLabel(text, label)) continue;
    add(label, 6, inferKind(label));
  }

  for (const acronym of text.match(/\b[A-Z][A-Z0-9][A-Z0-9./-]{1,18}\b/g) ?? []) {
    if (!isUsefulAcronym(acronym)) continue;
    add(acronym, acronym.length <= 3 ? 3.5 : 5, "acronym");
  }

  for (const phrase of properNounPhrases(text)) {
    add(phrase, phrase.split(/\s+/).length > 1 ? 4 : 2.25, inferKind(phrase));
  }

  for (const phrase of repeatedTechnicalPhrases(text)) {
    add(phrase, 2.5 + phrase.split(/\s+/).length * 0.35, inferKind(phrase));
  }

  for (const phrase of domainTermPhrases(text)) {
    add(phrase, 3.25 + phrase.split(/\s+/).length * 0.45, inferKind(phrase));
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
}

function containsQueryLabel(text: string, label: string): boolean {
  const normalized = normalizeLabel(label);
  if (!normalized) return false;

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isAcronym = /^[A-Z0-9./-]{2,}$/.test(normalized);
  return new RegExp(
    `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`,
    isAcronym ? "" : "i",
  ).test(text);
}

function properNounPhrases(text: string): string[] {
  const matches = text.match(
    /\b(?:[A-Z][a-zA-Z0-9/-]+|[A-Z]{2,})(?:\s+(?:of|and|for|the|to|[A-Z][a-zA-Z0-9/-]+|[A-Z]{2,})){0,5}/g,
  ) ?? [];

  return unique(matches.map((match) => cleanCandidateLabel(normalizeLabel(match))).filter((match) => {
    const words = match.split(/\s+/);
    if (words.length > MAX_ENTITY_WORDS) return false;
    if (words.length === 1 && match.length < 3) return false;
    if (hasBadBoundaryWord(words)) return false;
    return words.some((word) => /^[A-Z0-9]{2,}$/.test(word) || /^[A-Z][a-zA-Z0-9/-]+$/.test(word));
  }));
}

function repeatedTechnicalPhrases(text: string): string[] {
  const terms = tokenize(text).filter((term) => term.length > 2 && !STOP_WORDS.has(term) && !LOW_VALUE_LABELS.has(term));
  const counts = new Map<string, number>();

  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= terms.length - size; index += 1) {
      const phraseTerms = terms.slice(index, index + size);
      if (phraseTerms.some((term) => STOP_WORDS.has(term) || LOW_VALUE_LABELS.has(term))) continue;
      if (new Set(phraseTerms).size < phraseTerms.length) continue;
      const phrase = phraseTerms.join(" ");
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([phrase, count]) => count > 1 && isUsefulTechnicalPhrase(phrase))
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, 24)
    .map(([phrase]) => phrase);
}

function domainTermPhrases(text: string): string[] {
  const matches = text.match(
    /\b(?:(?:massive|extremity|external|internal|junctional|arterial|venous|severe|traumatic|penetrating|chest|airway|head)\s+)?(?:hemorrhage|bleeding|trauma|wounds?|injur(?:y|ies)|shock|hypothermia|pneumothorax|concussion|tourniquets?|dressings?|gauze|bandages?|splints?|airway|needle decompression|antibiotics?|evacuation|resuscitation)\b/gi,
  ) ?? [];

  return unique(matches.map((match) => cleanCandidateLabel(normalizeLabel(match))).filter(Boolean));
}

function extractRelations(text: string, entities: GlinerEntity[]): GlinerRelation[] {
  const seen = new Set<string>();
  const relations: GlinerRelation[] = [];

  for (const sentence of splitSentences(text)) {
    const present = entities
      .filter((entity) => entityAppearsInText(sentence, entity.label))
      .slice(0, 8);
    const directed = directedRelationFromSentence(sentence, present);
    if (directed) {
      const key = `${directed.source.toLowerCase()}\u0000${directed.relation}\u0000${directed.target.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        relations.push(directed);
      }
      continue;
    }

    for (let leftIndex = 0; leftIndex < present.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < present.length; rightIndex += 1) {
        const source = present[leftIndex].label;
        const target = present[rightIndex].label;
        const relation = inferRelation(sentence, source, target);
        if (relation === "CO_OCCURS_WITH") continue;
        const key = `${source.toLowerCase()}\u0000${relation}\u0000${target.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        relations.push({
          source,
          target,
          relation,
          evidence: sentence,
        });
      }
    }
  }

  return relations;
}

function directedRelationFromSentence(
  sentence: string,
  entities: GlinerEntity[],
): GlinerRelation | null {
  const match = relationEvidenceMatch(sentence);
  if (!match || entities.length < 2) return null;
  const allMentions = entities
    .map((entity) => ({
      entity,
      index: entityMentionIndex(sentence, entity.label),
    }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index);
  const before = entities
    .map((entity) => ({
      entity,
      index: entityMentionIndexBefore(sentence, entity.label, match.index),
    }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index);
  const after = entities
    .map((entity) => ({
      entity,
      index: entityMentionIndexAfter(sentence, entity.label, match.end),
    }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index);
  const source = before.at(-1)?.entity ?? allMentions[0]?.entity;
  const target = after.find((item) => item.entity.label !== source?.label)?.entity;
  if (!source || !target) return null;
  return {
    source: source.label,
    target: target.label,
    relation: match.relation,
    evidence: sentence,
  };
}

function inferRelation(sentence: string, source: string, target: string): string {
  const dictionaryRelation = relationForEvidence(sentence);
  if (dictionaryRelation) return dictionaryRelation;

  const sourceIndex = entityMentionIndex(sentence, source);
  const targetIndex = entityMentionIndex(sentence, target);
  if (sourceIndex < 0 || targetIndex < 0) return "CO_OCCURS_WITH";

  const [start, end] = sourceIndex < targetIndex
    ? [sourceIndex + source.length, targetIndex]
    : [targetIndex + target.length, sourceIndex];
  const between = sentence.slice(start, end);
  const terms = tokenize(between).filter((term) => !STOP_WORDS.has(term)).slice(0, 3);
  const canonical = canonicalizeDictionaryRelation(terms.join("_"));
  if (canonical) return canonical;

  return terms.length ? terms.join("_").toUpperCase() : "CO_OCCURS_WITH";
}

function inferKind(label: string): string {
  const dictionaryKind = dictionaryKindForLabel(label);
  if (dictionaryKind) return dictionaryKind;
  if (/^[A-Z0-9./-]{2,}$/.test(label)) return "acronym";
  if (/\b\d{4}\b/.test(label)) return "date";
  if (/\b(protocol|procedure|process|workflow|instruction|manual|standard|guideline|algorithm|phase|phases|care)\b/i.test(label)) return "protocol";
  if (/\b(treatment|tourniquets?|dressings?|gauze|bandages?|splints?|needle|decompression|airway|antibiotics?|medication|drug|dose|administer|control|evacuation|resuscitation)\b/i.test(label)) return "treatment";
  if (/\b(injury|injuries|hemorrhage|bleeding|trauma|wound|wounds|shock|hypothermia|pain|infection|fracture|burn|burns|casualty|casualties|pneumothorax|concussion)\b/i.test(label)) return "condition";
  if (/\b(system|platform|software|database|model|engine)\b/i.test(label)) return "system";
  if (/\b(command|office|department|agency|unit|wing|group|squadron|center|centre)\b/i.test(label)) return "organization";
  if (/\b(aircraft|device|tool|equipment|radio|sensor|weapon|vehicle)\b/i.test(label)) return "technology";
  return "concept";
}

function isUsefulEntity(label: string): boolean {
  if (!label) return false;
  const words = label.split(/\s+/);
  if (label.length < 3) return false;
  if (label.length > 90) return false;
  if (/^\W+$/.test(label)) return false;
  if (/^\d+(?:\.\d+)*$/.test(label)) return false;
  if (/^[A-Z]{4,}$/.test(label) && UPPERCASE_HEADING_WORDS.has(label)) return false;
  if (
    words.length === 1 &&
    LOW_VALUE_LABELS.has(label.toLowerCase()) &&
    !/^[A-Z0-9./-]{2,}$/.test(label)
  ) return false;
  if (/^(?:the\s+)?(?:following|these|those|this|that)\b/i.test(label)) return false;
  if (/[.!?:;,]$/.test(label)) return false;
  if (words.length > MAX_ENTITY_WORDS) return false;
  if (words.every((word) => STOP_WORDS.has(word.toLowerCase()))) return false;
  if (hasBadBoundaryWord(words)) return false;
  if (words.length > 1 && words.filter((word) => LOW_VALUE_LABELS.has(word.toLowerCase())).length > words.length / 2) return false;
  if (words.length === 1 && /^[a-z]+$/.test(label) && !isStrongSingleWord(label)) return false;
  return true;
}

function isRelationalPhrase(label: string): boolean {
  const words = label.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const relationalWords = words.filter((word) => RELATIONAL_ENTITY_TERMS.has(word)).length;
  if (!relationalWords) return false;
  return relationalWords / words.length >= 0.34 || relationalWords >= 2;
}

function cleanCandidateLabel(label: string): string {
  let cleaned = label
    .replace(/^[\s"'“”‘’()[\]{}<>]+|[\s"'“”‘’()[\]{}<>.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  for (let attempts = 0; attempts < 3 && cleaned; attempts += 1) {
    const words = cleaned.split(/\s+/);
    const first = words[0]?.toLowerCase();
    const last = words.at(-1)?.toLowerCase();
    if (first && LEADING_CONNECTORS.has(first)) {
      cleaned = words.slice(1).join(" ");
      continue;
    }
    if (last && TRAILING_CONNECTORS.has(last)) {
      cleaned = words.slice(0, -1).join(" ");
      continue;
    }
    break;
  }

  return cleaned.trim();
}

function hasBadBoundaryWord(words: string[]): boolean {
  const first = words[0]?.toLowerCase();
  const last = words.at(-1)?.toLowerCase();
  return Boolean((first && LEADING_CONNECTORS.has(first)) || (last && TRAILING_CONNECTORS.has(last)));
}

function isClassificationLabel(label: string): boolean {
  return CLASSIFICATION_LABELS.has(label.trim().toLowerCase());
}

function isStrongSingleWord(label: string): boolean {
  const lower = label.toLowerCase();
  if (lower.length < 5) return false;
  if (STOP_WORDS.has(lower) || LOW_VALUE_LABELS.has(lower)) return false;
  return /\b(injur(?:y|ies)|hemorrhage|tourniquets?|airway|trauma|casualt(?:y|ies)|evacuation|protocol|algorithm|antibiotics?|dressings?|gauze|bleeding|shock|hypothermia|pneumothorax|decompression)\b/i.test(label);
}

function isUsefulAcronym(label: string): boolean {
  const normalized = label.replace(/[./-]/g, "");
  if (normalized.length < 2 || normalized.length > 12) return false;
  if (UPPERCASE_HEADING_WORDS.has(normalized)) return false;
  if (/^\d+$/.test(normalized)) return false;
  return /[A-Z]/.test(normalized);
}

function isUsefulTechnicalPhrase(phrase: string): boolean {
  const words = phrase.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  if (hasBadBoundaryWord(words)) return false;
  if (words.some((word) => LOW_VALUE_LABELS.has(word.toLowerCase()))) return false;
  if (new Set(words).size < words.length) return false;
  return words.some((word) => isStrongSingleWord(word) || word.length >= 7);
}
