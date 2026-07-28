import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { databaseClient } from "$lib/server/database/database";
import type {
  CorpusSchema,
  ExtractedAssertion,
  SchemaCategory,
} from "./extraction";

export type EntityDictionaryEntry = {
  label: string;
  type: string;
  aliases?: string[];
  description?: string;
  source?: string;
  priority?: number;
};

export type RelationDictionaryEntry = {
  name: string;
  description: string;
  aliases?: string[];
  subjectTypes?: string[];
  objectTypes?: string[];
  source?: string;
  priority?: number;
  provenanceOnly?: boolean;
};

export type KnowledgeGraphDictionary = {
  version: string;
  sources: string[];
  entities: EntityDictionaryEntry[];
  relations: RelationDictionaryEntry[];
  entityTypes: SchemaCategory[];
  relationTypes: SchemaCategory[];
  entityAliases: Map<string, EntityDictionaryEntry>;
  relationAliases: Map<string, RelationDictionaryEntry>;
};

export const DICTIONARY_VERSION = "kg-dictionary-v1";

let rawDictionaryCache:
  | Promise<{
      sources: string[];
      entities: EntityDictionaryEntry[];
      relations: RelationDictionaryEntry[];
    }>
  | null = null;

export async function loadKnowledgeGraphDictionary(
  sample = "",
): Promise<KnowledgeGraphDictionary> {
  const [files, memory] = await Promise.all([readDictionaryFiles(), readMemory()]);
  const sampleWords = new Set(words(sample));
  const entities = uniqueEntities([
    ...files.entities,
    ...memory.entities,
  ]).sort((left, right) => score(right, sampleWords) - score(left, sampleWords));
  const relations = uniqueRelations([
    ...files.relations,
    ...memory.relations,
  ]);
  const entityTypes = uniqueCategories(
    entities.map((entry) => ({
      name: category(entry.type),
      description:
        entry.description ??
        `Dictionary-backed ${category(entry.type).replaceAll("_", " ")} entity`,
      source: entry.source ?? "dictionary",
    })),
  );
  const relationTypes = uniqueCategories(
    relations
      .filter((entry) => !entry.provenanceOnly)
      .map((entry) => ({
        name: category(entry.name),
        description: entry.description,
        source: entry.source ?? "dictionary",
        subjectTypes: strings(entry.subjectTypes).map(category),
        objectTypes: strings(entry.objectTypes).map(category),
      })),
  );
  const entityAliases = new Map<string, EntityDictionaryEntry>();
  for (const entry of entities) {
    for (const alias of [entry.label, ...(entry.aliases ?? [])]) {
      entityAliases.set(normalize(alias), entry);
    }
  }
  const relationAliases = new Map<string, RelationDictionaryEntry>();
  for (const entry of relations) {
    for (const alias of [entry.name, ...(entry.aliases ?? [])]) {
      relationAliases.set(category(alias), entry);
    }
  }
  return {
    version: DICTIONARY_VERSION,
    sources: [...files.sources, ...memory.sources],
    entities,
    relations,
    entityTypes,
    relationTypes,
    entityAliases,
    relationAliases,
  };
}

export function dictionaryPrompt(
  dictionary: KnowledgeGraphDictionary,
  entityLimit = 60,
): string {
  return JSON.stringify({
    version: dictionary.version,
    sources: dictionary.sources,
    rules: [
      "Use relation names exactly as canonical predicates when they fit the evidence.",
      "Use entity aliases to normalize labels, but only when the alias is actually present or clearly named.",
      "Skip page/table/layout/document-location facts; those belong in provenance, not semantic triples.",
      "If no listed relation fits, skip the assertion instead of inventing a vague predicate.",
    ],
    entityAliases: dictionary.entities.slice(0, entityLimit).map((entry) => ({
      label: entry.label,
      type: category(entry.type),
      aliases: entry.aliases ?? [],
    })),
    canonicalRelations: dictionary.relations
      .filter((entry) => !entry.provenanceOnly)
      .map((entry) => ({
        name: category(entry.name),
        description: entry.description,
        aliases: entry.aliases ?? [],
        subjectTypes: strings(entry.subjectTypes).map(category),
        objectTypes: strings(entry.objectTypes).map(category),
      })),
  });
}

export function canonicalizeAssertion(
  assertion: ExtractedAssertion,
  schema: CorpusSchema,
  dictionary: KnowledgeGraphDictionary,
): ExtractedAssertion | null {
  const relation = canonicalRelation(assertion.rawPredicate, schema, dictionary);
  if (!relation) return null;
  const subject = canonicalEntity(assertion.subject, dictionary);
  const object = canonicalEntity(assertion.object, dictionary);
  return {
    ...assertion,
    subject: subject?.label ?? assertion.subject,
    subjectType: subject ? category(subject.type) : category(assertion.subjectType),
    rawPredicate: category(relation.name),
    object: object?.label ?? assertion.object,
    objectType: object ? category(object.type) : category(assertion.objectType),
  };
}

export function canonicalRelation(
  value: string,
  schema: CorpusSchema,
  dictionary: KnowledgeGraphDictionary,
): RelationDictionaryEntry | null {
  const key = category(value);
  const fromDictionary = dictionary.relationAliases.get(key);
  if (fromDictionary) return fromDictionary.provenanceOnly ? null : fromDictionary;
  const fromSchema = schema.relationTypes.find((type) => type.name === key);
  if (!fromSchema) return null;
  return {
    name: fromSchema.name,
    description: fromSchema.description,
    subjectTypes: fromSchema.subjectTypes,
    objectTypes: fromSchema.objectTypes,
    source: fromSchema.source,
  };
}

function canonicalEntity(
  value: string,
  dictionary: KnowledgeGraphDictionary,
): EntityDictionaryEntry | null {
  const exact = dictionary.entityAliases.get(normalize(value));
  if (exact) return exact;
  const acronym = value.match(/\(([^)A-Za-z0-9]*[A-Z][A-Z0-9]{1,}[^)]*)\)/)?.[1];
  if (acronym) return dictionary.entityAliases.get(normalize(acronym)) ?? null;
  return null;
}

async function readDictionaryFiles(): Promise<{
  sources: string[];
  entities: EntityDictionaryEntry[];
  relations: RelationDictionaryEntry[];
}> {
  rawDictionaryCache ??= (async () => {
    const directory = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "dictionaries",
    );
    try {
      const files = (await readdir(directory)).filter((file) =>
        file.endsWith(".json"),
      );
      const loaded = await Promise.all(
        files.map(async (file) => ({
          file,
          value: JSON.parse(await readFile(resolve(directory, file), "utf8")) as
            | Record<string, unknown>
            | unknown[],
        })),
      );
      return {
        sources: files.map((file) => `dictionary:${file}`),
        entities: loaded.flatMap(({ value, file }) =>
          readEntities(value, `dictionary:${file}`),
        ),
        relations: loaded.flatMap(({ value, file }) =>
          readRelations(value, `dictionary:${file}`),
        ),
      };
    } catch {
      return { sources: [], entities: [], relations: [] };
    }
  })();
  return rawDictionaryCache;
}

async function readMemory(): Promise<{
  sources: string[];
  entities: EntityDictionaryEntry[];
  relations: RelationDictionaryEntry[];
}> {
  try {
    const [entityRows, relationRows] = await Promise.all([
      databaseClient.execute(
        "SELECT canonical_name, entity_type, aliases_json FROM kg_new_entity_memory WHERE approved = 1",
      ),
      databaseClient.execute(
        `SELECT canonical_predicate, description, aliases_json,
                subject_types_json, object_types_json
         FROM kg_new_relation_memory WHERE approved = 1`,
      ),
    ]);
    return {
      sources: ["kg-memory"],
      entities: entityRows.rows.map((row) => ({
        label: String(row.canonical_name),
        type: String(row.entity_type),
        aliases: parseStrings(row.aliases_json),
        source: "kg-memory",
      })),
      relations: relationRows.rows.map((row) => ({
        name: String(row.canonical_predicate),
        description: String(row.description),
        aliases: parseStrings(row.aliases_json),
        subjectTypes: parseStrings(row.subject_types_json),
        objectTypes: parseStrings(row.object_types_json),
        source: "kg-memory",
      })),
    };
  } catch {
    return { sources: [], entities: [], relations: [] };
  }
}

function readEntities(
  value: Record<string, unknown> | unknown[],
  fallbackSource: string,
): EntityDictionaryEntry[] {
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
        source: clean(row.source) || fallbackSource,
        priority: number(row.priority),
      },
    ];
  });
}

function readRelations(
  value: Record<string, unknown> | unknown[],
  fallbackSource: string,
): RelationDictionaryEntry[] {
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
    if (!name || !description || name === "related_to") return [];
    return [
      {
        name,
        description,
        aliases: strings(row.aliases),
        subjectTypes: strings(row.subjectTypes),
        objectTypes: strings(row.objectTypes),
        source: clean(row.source) || fallbackSource,
        priority: number(row.priority),
        provenanceOnly: row.provenanceOnly === true,
      },
    ];
  });
}

function uniqueEntities(entries: EntityDictionaryEntry[]): EntityDictionaryEntry[] {
  return [
    ...new Map(entries.map((entry) => [normalize(entry.label), entry])).values(),
  ];
}

function uniqueRelations(
  entries: RelationDictionaryEntry[],
): RelationDictionaryEntry[] {
  return [
    ...new Map(entries.map((entry) => [category(entry.name), entry])).values(),
  ];
}

function uniqueCategories(entries: SchemaCategory[]): SchemaCategory[] {
  return [
    ...new Map(entries.map((entry) => [category(entry.name), entry])).values(),
  ];
}

function score(entry: EntityDictionaryEntry, sampleWords: Set<string>): number {
  const terms = [entry.label, ...(entry.aliases ?? [])].flatMap(words);
  const lexical = terms.filter((term) => sampleWords.has(term)).length;
  return lexical + (entry.priority ?? 0);
}

function parseStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    return Array.isArray(parsed) ? parsed.map(clean).filter(Boolean) : [];
  } catch {
    return [];
  }
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

function words(value: string): string[] {
  return (
    value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .match(/[a-z][a-z0-9]{2,}/g) ?? []
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function category(value: unknown): string {
  return clean(value)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
