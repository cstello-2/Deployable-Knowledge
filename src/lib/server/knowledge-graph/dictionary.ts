import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeLabel } from "./utils";

type EntityDictionaryEntry = {
  label: string;
  type: string;
  aliases?: string[];
  description?: string;
  source?: string;
  priority?: number;
};

type RelationDictionaryEntry = {
  name: string;
  description: string;
  aliases?: string[];
  subjectTypes?: string[];
  objectTypes?: string[];
  source?: string;
  priority?: number;
  provenanceOnly?: boolean;
};

type Dictionary = {
  entities: EntityDictionaryEntry[];
  relations: RelationDictionaryEntry[];
  entityAliases: Map<string, EntityDictionaryEntry>;
  relationAliases: Map<string, RelationDictionaryEntry>;
};

let cache: Dictionary | null = null;

export type DictionaryEntityCandidate = {
  label: string;
  kind: string;
  score: number;
};

export function dictionaryEntityCandidates(text: string): DictionaryEntityCandidate[] {
  const dictionary = loadDictionary();
  const candidates = new Map<string, DictionaryEntityCandidate>();
  for (const entry of dictionary.entities) {
    const matched = [entry.label, ...(entry.aliases ?? [])].some((alias) =>
      containsDictionaryPhrase(text, alias),
    );
    if (!matched) continue;
    const key = normalize(entry.label);
    const candidate = candidates.get(key);
    const score = 7 + (entry.priority ?? 0);
    if (!candidate || score > candidate.score) {
      candidates.set(key, {
        label: entry.label,
        kind: category(entry.type) || "concept",
        score,
      });
    }
  }
  return [...candidates.values()];
}

export function canonicalizeDictionaryEntity(label: string): {
  label: string;
  kind: string;
} | null {
  const entry = loadDictionary().entityAliases.get(normalize(label));
  return entry
    ? { label: entry.label, kind: category(entry.type) || "concept" }
    : null;
}

export function dictionaryKindForLabel(label: string): string | null {
  return canonicalizeDictionaryEntity(label)?.kind ?? null;
}

export function relationForEvidence(sentence: string): string | null {
  return relationEvidenceMatch(sentence)?.relation ?? null;
}

export function relationEvidenceMatch(sentence: string): {
  relation: string;
  index: number;
  end: number;
} | null {
  const dictionary = loadDictionary();
  const aliases = [...dictionary.relationAliases.entries()]
    .filter(([, entry]) => !entry.provenanceOnly)
    .sort((left, right) => right[0].length - left[0].length);
  for (const [alias, entry] of aliases) {
    if (alias.length < 3) continue;
    const match = tokenizedMatch(sentence, alias);
    if (match) {
      return {
        relation: category(entry.name).toUpperCase(),
        index: match.index,
        end: match.end,
      };
    }
  }
  return null;
}

export function entityAppearsInText(text: string, label: string): boolean {
  return entityMentionIndex(text, label) >= 0;
}

export function entityMentionIndex(text: string, label: string): number {
  return entityMentionIndexAfter(text, label, 0);
}

export function entityMentionIndexAfter(
  text: string,
  label: string,
  minimumIndex: number,
): number {
  const dictionary = loadDictionary();
  const entry = dictionary.entityAliases.get(normalize(label));
  const aliases = entry ? [entry.label, ...(entry.aliases ?? [])] : [label];
  let best = -1;
  for (const alias of aliases) {
    const index = phraseIndexAfter(text, alias, minimumIndex);
    if (index >= 0 && (best < 0 || index < best)) best = index;
  }
  return best;
}

export function entityMentionIndexBefore(
  text: string,
  label: string,
  maximumIndex: number,
): number {
  const dictionary = loadDictionary();
  const entry = dictionary.entityAliases.get(normalize(label));
  const aliases = entry ? [entry.label, ...(entry.aliases ?? [])] : [label];
  let best = -1;
  for (const alias of aliases) {
    const index = phraseIndexBefore(text, alias, maximumIndex);
    if (index >= 0 && index > best) best = index;
  }
  return best;
}

export function canonicalizeDictionaryRelation(relation: string): string | null {
  const entry = loadDictionary().relationAliases.get(category(relation));
  return entry && !entry.provenanceOnly ? category(entry.name).toUpperCase() : null;
}

function loadDictionary(): Dictionary {
  if (cache) return cache;
  const root = dirname(fileURLToPath(import.meta.url));
  const directories = [
    resolve(root, "dictionaries"),
    resolve(root, "../knowledge-graph-new/dictionaries"),
  ];
  const entities: EntityDictionaryEntry[] = [];
  const relations: RelationDictionaryEntry[] = [];

  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      if (!file.endsWith(".json")) continue;
      try {
        const value = JSON.parse(readFileSync(resolve(directory, file), "utf8")) as
          | Record<string, unknown>
          | unknown[];
        entities.push(...readEntities(value));
        relations.push(...readRelations(value));
      } catch (error) {
        console.warn(`Skipping Knowledge Graph dictionary ${file}: ${error}`);
      }
    }
  }

  const entityAliases = new Map<string, EntityDictionaryEntry>();
  for (const entry of uniqueEntities(entities)) {
    for (const alias of [entry.label, ...(entry.aliases ?? [])]) {
      entityAliases.set(normalize(alias), entry);
    }
  }

  const relationAliases = new Map<string, RelationDictionaryEntry>();
  for (const entry of uniqueRelations(relations)) {
    for (const alias of [entry.name, ...(entry.aliases ?? [])]) {
      relationAliases.set(category(alias), entry);
    }
  }

  cache = {
    entities: [...entityAliases.values()],
    relations: [...relationAliases.values()],
    entityAliases,
    relationAliases,
  };
  return cache;
}

function readEntities(value: Record<string, unknown> | unknown[]): EntityDictionaryEntry[] {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(value.entities)
      ? value.entities
      : [];
  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const label = clean(row.label);
    const type = category(row.type);
    if (!label || !type) return [];
    return [
      {
        label,
        type,
        aliases: strings(row.aliases),
        description: clean(row.description),
        source: clean(row.source),
        priority: number(row.priority),
      },
    ];
  });
}

function readRelations(value: Record<string, unknown> | unknown[]): RelationDictionaryEntry[] {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(value.relations)
      ? value.relations
      : [];
  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = category(row.name);
    const description = clean(row.description);
    if (!name || !description) return [];
    return [
      {
        name,
        description,
        aliases: strings(row.aliases),
        subjectTypes: strings(row.subjectTypes),
        objectTypes: strings(row.objectTypes),
        source: clean(row.source),
        priority: number(row.priority),
        provenanceOnly: row.provenanceOnly === true,
      },
    ];
  });
}

function uniqueEntities(entries: EntityDictionaryEntry[]): EntityDictionaryEntry[] {
  return [...new Map(entries.map((entry) => [normalize(entry.label), entry])).values()];
}

function uniqueRelations(entries: RelationDictionaryEntry[]): RelationDictionaryEntry[] {
  return [...new Map(entries.map((entry) => [category(entry.name), entry])).values()];
}

function containsDictionaryPhrase(text: string, phrase: string): boolean {
  if (!phrase.trim()) return false;
  const words = phrase.trim().split(/\s+/);
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "gi");
  for (const match of text.matchAll(expression)) {
    const value = match[0] ?? "";
    if (words.length === 1 && value === value.toUpperCase()) continue;
    return true;
  }
  return false;
}

function phraseIndexAfter(text: string, phrase: string, minimumIndex: number): number {
  if (!phrase.trim()) return -1;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "gi");
  for (const match of text.matchAll(expression)) {
    if (match.index >= minimumIndex) return match.index;
  }
  return -1;
}

function phraseIndexBefore(text: string, phrase: string, maximumIndex: number): number {
  if (!phrase.trim()) return -1;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "gi");
  let best = -1;
  for (const match of text.matchAll(expression)) {
    if (match.index >= maximumIndex) continue;
    best = match.index;
  }
  return best;
}

function containsTokenized(text: string, tokenizedAlias: string): boolean {
  return tokenizedMatch(text, tokenizedAlias) !== null;
}

function tokenizedMatch(text: string, tokenizedAlias: string): {
  index: number;
  end: number;
} | null {
  const tokens = tokenizedAlias.split("_").filter(Boolean);
  if (!tokens.length) return null;
  const expression = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\W+");
  const match = new RegExp(`(?<![A-Za-z0-9])${expression}(?![A-Za-z0-9])`, "i").exec(text);
  return match ? { index: match.index, end: match.index + match[0].length } : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalize(value: string): string {
  return normalizeLabel(value).toLowerCase();
}

function category(value: unknown): string {
  return clean(value)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
