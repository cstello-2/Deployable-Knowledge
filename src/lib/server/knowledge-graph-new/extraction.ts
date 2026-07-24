import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { Parser, Store } from "n3";
import { getProvider } from "$lib/server/providers/registry";
import type { ProviderChatOptions } from "$lib/server/providers/provider";

export type GraphChunk = {
  chunkId: string;
  documentId: string;
  content: string;
};

export type SchemaCategory = {
  name: string;
  description: string;
  source: string;
  subjectTypes?: string[];
  objectTypes?: string[];
};

export type CorpusSchema = {
  entityTypes: SchemaCategory[];
  relationTypes: SchemaCategory[];
  sampledChunkIds: string[];
  version: string;
};

export type Extractor = "llm" | "gliner";

export type ExtractedAssertion = {
  subject: string;
  subjectType: string;
  rawPredicate: string;
  object: string;
  objectType: string;
  evidence: string;
  startDate: string | null;
  endDate: string | null;
  status: "asserted" | "negated" | "uncertain";
  extractors: Extractor[];
  verified: boolean;
  score: number | null;
  offsets: [number, number, number, number] | null;
};

export type ExtractionResult = {
  assertions: ExtractedAssertion[];
};

export type ExtractionSettings = {
  providerId: string;
  modelId: string;
  providerOptions?: ProviderChatOptions;
  useGliner?: boolean;
};

type ScoredTerm = SchemaCategory & { relation: boolean; score: number };

const VERSION = "kg-v4";
const ONTOLOGIES = [
  "https://schema.org/version/latest/schemaorg-current-https.ttl",
  "https://www.w3.org/ns/prov.ttl",
];
const UNIVERSAL: SchemaCategory[] = [
  ["person", "A named individual"],
  ["organization", "A named organization or institution"],
  ["location", "A named geographic or physical place"],
  ["event", "A named historical, scientific, or operational event"],
  ["document", "A named publication, law, treaty, or standard"],
  ["date", "A date or named time period"],
  ["system", "A named technical, organizational, or conceptual system"],
  ["component", "A named part of a larger system"],
  ["process", "A named procedure, operation, or method"],
  ["object", "A named physical or conceptual object"],
].map(([name, description]) => ({ name, description, source: "universal" }));

const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const array = (items: unknown, maxItems?: number) => ({
  type: "array",
  items,
  ...(maxItems ? { maxItems } : {}),
});

const SCHEMA_OUTPUT = object({
  entityTypes: array(
    object({ name: string, description: string, source: string }),
    5,
  ),
  relationTypes: array(
    object({
      name: string,
      description: string,
      subjectTypes: array(string),
      objectTypes: array(string),
      source: string,
    }),
    20,
  ),
});
const ASSERTION = object({
  subject: string,
  subjectType: string,
  rawPredicate: string,
  object: string,
  objectType: string,
  evidence: string,
  startDate: nullableString,
  endDate: nullableString,
  status: { type: "string", enum: ["asserted", "negated", "uncertain"] },
});
const EXTRACTION_OUTPUT = object({ assertions: array(ASSERTION, 30) });
const VERIFICATION_OUTPUT = object({
  accepted: array({ type: "integer" }),
});

export function extractionVersion(): Record<string, unknown> {
  return {
    version: VERSION,
    model:
      process.env.KNOWLEDGE_GRAPH_GLINER_MODEL ??
      "knowledgator/gliner-relex-large-v0.5",
    entity: process.env.KNOWLEDGE_GRAPH_GLINER_THRESHOLD ?? "0.4",
    adjacency:
      process.env.KNOWLEDGE_GRAPH_GLINER_ADJACENCY_THRESHOLD ?? "0.55",
    relation:
      process.env.KNOWLEDGE_GRAPH_GLINER_RELATION_THRESHOLD ?? "0.75",
    other: process.env.KNOWLEDGE_GRAPH_GLINER_OTHER !== "false",
  };
}

export async function discoverCorpusSchema(
  chunks: GraphChunk[],
  settings: ExtractionSettings,
): Promise<CorpusSchema> {
  const sampled = sampleChunks(chunks, 18);
  const sample = sampled
    .map((chunk, index) => `[${index + 1}] ${chunk.content}`)
    .join("\n\n")
    .slice(0, 18_000);
  if (!sample) throw new Error("No usable text is available for schema discovery.");

  const ontologyTerms = await loadOntologyTerms(sample);
  const result = await askJson<{
    entityTypes: unknown;
    relationTypes: unknown;
  }>(
    settings,
    `Create a compact extraction schema for this unfamiliar corpus.

Universal entity types:
${JSON.stringify(UNIVERSAL)}

Lexically relevant established ontology terms:
${JSON.stringify(ontologyTerms)}

Select established terms, merge synonyms, and add only genuinely missing
corpus-specific categories. Categories must be reusable types, never entity
names. Relations must be precise, directed, and explicitly supportable from
text. Never create related_to or co-occurrence relations. Return at most five
additional entity types and twenty relations.

Corpus sample:
${sample}`,
    SCHEMA_OUTPUT,
    2_000,
  );

  const entityTypes = unique([
    ...UNIVERSAL,
    ...readCategories(result.entityTypes),
  ]).slice(0, 15);
  const relationTypes = readCategories(result.relationTypes, true).slice(0, 20);
  if (!relationTypes.length) {
    throw new Error("Schema discovery returned no usable relation types.");
  }
  return {
    entityTypes,
    relationTypes,
    sampledChunkIds: sampled.map((chunk) => chunk.chunkId),
    version: VERSION,
  };
}

export async function extractWithLlm(
  chunk: GraphChunk,
  schema: CorpusSchema,
  settings: ExtractionSettings,
): Promise<ExtractionResult> {
  const result = await askJson<Record<string, unknown>>(
    settings,
    `Extract a small, evidence-grounded knowledge graph from this chunk.

Schema guidance:
${JSON.stringify(schema)}

Extract only explicitly stated, meaningful relationships. Copy subject, object,
and one evidence substring exactly from the chunk; the evidence must contain
both endpoints. Preserve direction, dates, negation, and uncertainty. Do not
connect nearby entities, extract formatting, or emit every noun phrase. The
schema is guidance, not a closed list. Return an empty assertions array when
there is no useful relationship.

Chunk:
${chunk.content}`,
    EXTRACTION_OUTPUT,
    4_000,
  );
  return parseResult(result, chunk.content, "llm");
}

export async function runGliner(
  chunks: GraphChunk[],
  schema: CorpusSchema,
  onResult?: (
    chunkId: string,
    result: ExtractionResult,
  ) => Promise<void>,
): Promise<Map<string, ExtractionResult>> {
  if (!chunks.length) return new Map();
  const script = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "gliner-extractor.py",
  );
  const python =
    process.env.KNOWLEDGE_GRAPH_PYTHON ??
    process.env.PYTHON ??
    pythonExecutable();
  const labels = schema.entityTypes.map((type) => type.name);
  if (process.env.KNOWLEDGE_GRAPH_GLINER_OTHER !== "false") {
    labels.push("other");
  }

  const byId = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const results = new Map<string, ExtractionResult>();
  const child = spawn(python, [script], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on(
    "data",
    (data) => (stderr = `${stderr}${String(data)}`.slice(-12_000)),
  );
  const exited = new Promise<number | null>((done, fail) => {
    child.on("error", fail);
    child.on("close", done);
  });
  child.stdin.end(
    JSON.stringify({
      chunks,
      entityTypes: labels,
      relationTypes: schema.relationTypes.map((type) => type.name),
    }),
  );

  try {
    for await (const line of createInterface({ input: child.stdout })) {
      if (!line.trim()) continue;
      const item = JSON.parse(line) as Record<string, unknown>;
      const id = clean(item.chunkId);
      const chunk = byId.get(id);
      if (!chunk) continue;
      const result = parseResult(item, chunk.content, "gliner");
      results.set(id, result);
      await onResult?.(id, result);
    }
  } catch (error) {
    child.kill();
    await exited.catch(() => undefined);
    throw error;
  }

  const code = await exited;
  if (code !== 0) {
    throw new Error(stderr.trim() || `GLiNER exited with code ${code}`);
  }
  return results;
}

export async function reconcileExtractions(
  text: string,
  schema: CorpusSchema,
  llm: ExtractionResult,
  gliner: ExtractionResult,
  settings: ExtractionSettings,
): Promise<ExtractionResult> {
  const assertions = llm.assertions
    .filter((assertion) => fitsSchema(assertion, schema))
    .map((assertion) => ({ ...assertion }));
  for (const candidate of gliner.assertions) {
    if (!fitsSchema(candidate, schema)) continue;
    const match = assertions.find((assertion) =>
      sameAssertion(assertion, candidate),
    );
    if (match) {
      match.extractors = ["llm", "gliner"];
      match.score = candidate.score;
      match.offsets ??= candidate.offsets;
    } else {
      assertions.push({ ...candidate });
    }
  }

  const singles = assertions.filter((item) => item.extractors.length === 1);
  if (!singles.length) return { assertions };
  const accepted = await verify(text, singles, settings);
  return {
    assertions: assertions.flatMap((assertion) =>
      assertion.extractors.length > 1
        ? [assertion]
        : accepted.has(key(assertion))
          ? [{ ...assertion, verified: true }]
          : [],
    ),
  };
}

export function emptyExtraction(): ExtractionResult {
  return { assertions: [] };
}

export function hasUsableText(text: string): boolean {
  const words = text.match(/\p{L}[\p{L}\p{N}'’-]{2,}/gu) ?? [];
  return words.length >= 3 && words.join("").length >= 12;
}

async function verify(
  text: string,
  assertions: ExtractedAssertion[],
  settings: ExtractionSettings,
): Promise<Set<string>> {
  const candidates = assertions.map((assertion, index) => ({
    index,
    subject: assertion.subject,
    subjectType: assertion.subjectType,
    predicate: assertion.rawPredicate,
    object: assertion.object,
    objectType: assertion.objectType,
    evidence: assertion.evidence,
    status: assertion.status,
  }));
  const result = await askJson<{ accepted: number[] }>(
    settings,
    `Strictly verify each candidate against the chunk. Accept only when the
evidence explicitly states the proposed meaning in the proposed direction.
Reject co-occurrence, implication, vague wording, reversed direction, missing
context, and unsupported types. Return accepted indexes only.

Chunk:
${text}

Candidates:
${JSON.stringify(candidates)}`,
    VERIFICATION_OUTPUT,
    700,
  );
  const accepted = new Set(
    result.accepted.filter((value) => Number.isInteger(value)),
  );
  return new Set(
    assertions.filter((_, index) => accepted.has(index)).map(key),
  );
}

function parseResult(
  value: Record<string, unknown>,
  text: string,
  extractor: Extractor,
): ExtractionResult {
  const raw = Array.isArray(value.assertions) ? value.assertions : [];
  const assertions = raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const subject = clean(row.subject);
    const object = clean(row.object);
    const rawPredicate = category(row.rawPredicate);
    const evidence = clean(row.evidence);
    if (
      !subject ||
      !object ||
      !rawPredicate ||
      normalize(subject) === normalize(object) ||
      !text.includes(evidence) ||
      !evidence.includes(subject) ||
      !evidence.includes(object)
    ) {
      return [];
    }
    const status = clean(row.status);
    const offsets = ["headStart", "headEnd", "tailStart", "tailEnd"].map(
      (name) => integer(row[name]),
    );
    return [
      {
        subject,
        subjectType: category(row.subjectType) || "unknown",
        rawPredicate,
        object,
        objectType: category(row.objectType) || "unknown",
        evidence,
        startDate: clean(row.startDate) || null,
        endDate: clean(row.endDate) || null,
        status:
          status === "negated" || status === "uncertain"
            ? status
            : "asserted",
        extractors: [extractor],
        verified: false,
        score: number(row.score),
        offsets: offsets.every((value) => value !== null)
          ? (offsets as [number, number, number, number])
          : null,
      } satisfies ExtractedAssertion,
    ];
  });
  return { assertions: unique(assertions) };
}

function fitsSchema(
  assertion: ExtractedAssertion,
  schema: CorpusSchema,
): boolean {
  const relation = schema.relationTypes.find(
    (type) => type.name === category(assertion.rawPredicate),
  );
  if (!relation) return true;
  return (
    accepts(relation.subjectTypes, assertion.subjectType) &&
    accepts(relation.objectTypes, assertion.objectType)
  );
}

function accepts(allowed: string[] | undefined, actual: string): boolean {
  return (
    !allowed?.length ||
    actual === "unknown" ||
    actual === "other" ||
    allowed.map(category).includes(category(actual))
  );
}

async function askJson<T>(
  settings: ExtractionSettings,
  prompt: string,
  format: Record<string, unknown>,
  maxTokens: number,
): Promise<T> {
  const attempts = positiveInteger(
    process.env.KNOWLEDGE_GRAPH_JSON_ATTEMPTS,
    3,
  );
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      let output = "";
      for await (const part of getProvider(settings.providerId).chat(
        prompt,
        settings.modelId,
        {
          temperature: 0,
          topK: 20,
          ...settings.providerOptions,
          format,
          maxTokens: settings.providerOptions?.maxTokens ?? maxTokens,
        },
      )) {
        output += part;
      }
      return JSON.parse(output) as T;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  throw new Error(
    `Structured model request failed after ${attempts} attempts: ${message(lastError)}`,
  );
}

async function loadOntologyTerms(sample: string): Promise<SchemaCategory[]> {
  try {
    const store = new Store();
    for (const url of ONTOLOGIES) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      store.addQuads(
        new Parser({ baseIRI: url }).parse(await response.text()),
      );
    }
    return selectOntologyTerms(store, sample);
  } catch (error) {
    console.warn(`Ontology loading failed; using universal seeds: ${error}`);
    return [];
  }
}

function selectOntologyTerms(
  store: Store,
  sample: string,
): SchemaCategory[] {
  const rdfType = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  const kinds = [
    ["http://www.w3.org/2000/01/rdf-schema#Class", false],
    ["http://www.w3.org/2002/07/owl#Class", false],
    ["http://www.w3.org/1999/02/22-rdf-syntax-ns#Property", true],
    ["http://www.w3.org/2002/07/owl#ObjectProperty", true],
    ["http://www.w3.org/2002/07/owl#DatatypeProperty", true],
  ] as const;
  const sampleWords = new Set(words(sample));
  const found = new Map<string, ScoredTerm>();

  for (const [kind, relation] of kinds) {
    for (const quad of store.getQuads(null, rdfType, kind, null)) {
      if (quad.subject.termType !== "NamedNode") continue;
      const id = quad.subject.value;
      const name = literal(store, id, "label") ?? localName(id);
      const term = {
        name: category(name),
        description:
          literal(store, id, "comment")?.slice(0, 300) ?? name,
        source: id.startsWith("https://schema.org/")
          ? "schema.org"
          : "prov-o",
        subjectTypes: relation ? objects(store, id, "domain") : [],
        objectTypes: relation ? objects(store, id, "range") : [],
        relation,
      };
      const score = words(`${name} ${term.description}`).filter((word) =>
        sampleWords.has(word),
      ).length;
      if (score) found.set(`${relation}:${term.name}`, { ...term, score });
    }
  }

  return [...found.values()]
    .sort((left, right) => right.score - left.score)
    .filter(
      (term, index, all) =>
        all.slice(0, index).filter((item) => item.relation === term.relation)
          .length < (term.relation ? 30 : 20),
    )
    .map(({ name, description, source, subjectTypes, objectTypes }) => ({
      name,
      description,
      source,
      subjectTypes,
      objectTypes,
    }));
}

function literal(
  store: Store,
  subject: string,
  name: "label" | "comment",
): string | null {
  const predicate = `http://www.w3.org/2000/01/rdf-schema#${name}`;
  const values = store.getObjects(subject, predicate, null);
  return (
    values.find(
      (value) => value.termType === "Literal" && value.language === "en",
    )?.value ??
    values.find(
      (value) => value.termType === "Literal" && !value.language,
    )?.value ??
    null
  );
}

function objects(
  store: Store,
  subject: string,
  name: "domain" | "range",
): string[] {
  const predicate = `http://www.w3.org/2000/01/rdf-schema#${name}`;
  return store.getObjects(subject, predicate, null).flatMap((value) =>
    value.termType === "NamedNode"
      ? [category(localName(value.value))]
      : [],
  );
}

function readCategories(value: unknown, relations = false): SchemaCategory[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = category(row.name);
    const description = clean(row.description);
    if (!name || !description || name === "related_to") return [];
    return [
      {
        name,
        description,
        source: clean(row.source) || "llm",
        ...(relations
          ? {
              subjectTypes: strings(row.subjectTypes).map(category),
              objectTypes: strings(row.objectTypes).map(category),
            }
          : {}),
      },
    ];
  });
}

function sampleChunks(chunks: GraphChunk[], limit: number): GraphChunk[] {
  if (chunks.length <= limit) return chunks;
  const step = (chunks.length - 1) / (limit - 1);
  return [...new Set(Array.from({ length: limit }, (_, i) => chunks[Math.round(i * step)]))];
}

function sameAssertion(
  left: ExtractedAssertion,
  right: ExtractedAssertion,
): boolean {
  if (
    normalize(left.subject) !== normalize(right.subject) ||
    normalize(left.object) !== normalize(right.object)
  ) {
    return false;
  }
  const leftWords = new Set(words(left.rawPredicate));
  const rightWords = new Set(words(right.rawPredicate));
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
  return overlap > 0 && overlap / Math.min(leftWords.size, rightWords.size) >= 0.5;
}

function key(assertion: ExtractedAssertion): string {
  return [
    normalize(assertion.subject),
    category(assertion.rawPredicate),
    normalize(assertion.object),
    assertion.evidence,
  ].join("\u0000");
}

function unique<T extends { name?: string } | ExtractedAssertion>(
  items: T[],
): T[] {
  return [
    ...new Map(
      items.map((item) => [
        "subject" in item ? key(item) : item.name ?? "",
        item,
      ]),
    ).values(),
  ];
}

function pythonExecutable(): string {
  const local = resolve(
    process.cwd(),
    process.platform === "win32"
      ? ".venv/Scripts/python.exe"
      : ".venv/bin/python",
  );
  if (existsSync(local)) return local;
  return process.platform === "win32" ? "python" : "python3";
}

function words(value: string): string[] {
  return (
    value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .match(/[a-z][a-z0-9]{2,}/g) ?? []
  );
}

function localName(value: string): string {
  return decodeURIComponent(value.split(/[/#]/).pop() ?? "");
}

function category(value: unknown): string {
  return clean(value)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
