import { createHash } from "node:crypto";
import { asc, inArray } from "drizzle-orm";
import { databaseClient, db } from "$lib/server/database/database";
import { document_chunks as documentChunks } from "$lib/server/database/schema";
import {
  discoverCorpusSchema,
  emptyExtraction,
  extractWithLlm,
  extractionVersion,
  hasUsableText,
  reconcileExtractions,
  runGliner,
  type CorpusSchema,
  type ExtractionResult,
  type ExtractionSettings,
  type Extractor,
  type GraphChunk,
} from "./extraction";

type Provenance = {
  extractors: Extractor[];
  verified: boolean;
  score: number | null;
  offsets: [number, number, number, number] | null;
  rawSubject: string;
  rawObject: string;
};

export type GraphAssertion = {
  id: string;
  documentId: string;
  chunkId: string;
  subject: string;
  subjectType: string;
  rawPredicate: string;
  canonicalPredicate: string;
  object: string;
  objectType: string;
  evidence: string;
  startDate: string | null;
  endDate: string | null;
  status: "asserted" | "negated" | "uncertain";
  provenance: Provenance;
};

export type KnowledgeGraph = {
  schema: CorpusSchema;
  entities: Array<{ name: string; type: string; aliases: string[] }>;
  assertions: GraphAssertion[];
};

export type BuildOptions = ExtractionSettings & {
  documentIds?: string[];
  chunkLimit?: number;
  force?: boolean;
  onProgress?: (progress: {
    stage: "schema" | "extracting" | "reconciling" | "saving";
    completed: number;
    total: number;
  }) => void;
};

export type BuildResult = {
  reused: boolean;
  chunks: number;
  graph: KnowledgeGraph;
};

const VERSION = "kg-build-v3";

export async function buildKnowledgeGraph(
  options: BuildOptions,
): Promise<BuildResult> {
  await ensureTables();
  const documentIds = uniqueIds(options.documentIds ?? []);
  const chunks = limitChunks(
    await loadChunks(documentIds),
    options.chunkLimit,
  );
  if (!chunks.length) throw new Error("No stored document chunks are available.");

  const scope = documentIds.length
    ? `documents:${hash(documentIds.join("\0"))}`
    : "*";
  const signature = hash(
    JSON.stringify({
      version: VERSION,
      llm: llmVersion(options),
      extraction: extractionVersion(),
      useGliner: options.useGliner !== false,
      chunks: chunks.map((chunk) => [
        chunk.chunkId,
        chunk.documentId,
        hash(chunk.content),
      ]),
    }),
  );
  const previous = await databaseClient.execute({
    sql: "SELECT signature FROM kg_new_builds WHERE scope_key = ?",
    args: [scope],
  });
  if (
    !options.force &&
    String(previous.rows[0]?.signature ?? "") === signature
  ) {
    return {
      reused: true,
      chunks: chunks.length,
      graph: await loadKnowledgeGraph(documentIds),
    };
  }

  const cache = await readCache();
  progress(options, "schema", 0, 1);
  const schemaKey = cacheKey("schema", {
    chunks: chunks.map((chunk) => [chunk.chunkId, hash(chunk.content)]),
    llm: llmVersion(options),
    extraction: extractionVersion(),
  });
  let schema = parse<CorpusSchema>(cache.get(schemaKey));
  if (!schema) {
    schema = await discoverCorpusSchema(chunks, options);
    await writeCache([{ key: schemaKey, value: schema }]);
  }
  progress(options, "schema", 1, 1);

  const keys = new Map(
    chunks.map((chunk) => [
      chunk.chunkId,
      chunkKeys(chunk, hash(JSON.stringify(schema)), options),
    ]),
  );
  const final = new Map<string, ExtractionResult>();
  const llm = new Map<string, ExtractionResult>();
  const gliner = new Map<string, ExtractionResult>();
  const pending = chunks.filter((chunk) => {
    const chunkKeys = keys.get(chunk.chunkId)!;
    const completed = parse<ExtractionResult>(cache.get(chunkKeys.final));
    if (completed) final.set(chunk.chunkId, completed);
    const llmResult = parse<ExtractionResult>(cache.get(chunkKeys.llm));
    const glinerResult = parse<ExtractionResult>(cache.get(chunkKeys.gliner));
    if (llmResult) llm.set(chunk.chunkId, llmResult);
    if (glinerResult) gliner.set(chunk.chunkId, glinerResult);
    return !completed;
  });
  const usable = pending.filter((chunk) => hasUsableText(chunk.content));
  const missingGliner = usable.filter((chunk) => !gliner.has(chunk.chunkId));
  const glinerPromise =
    options.useGliner === false
      ? Promise.resolve(new Map<string, ExtractionResult>())
      : runGliner(missingGliner, schema);

  const failures: string[] = [];
  let completed = chunks.length - pending.length;
  progress(options, "extracting", completed, chunks.length);
  for (const chunk of pending) {
    if (!llm.has(chunk.chunkId)) {
      try {
        const result = hasUsableText(chunk.content)
          ? await extractWithLlm(chunk, schema, options)
          : emptyExtraction();
        llm.set(chunk.chunkId, result);
        await writeCache([{ key: keys.get(chunk.chunkId)!.llm, value: result }]);
      } catch (error) {
        failures.push(`${chunk.chunkId}: ${message(error)}`);
      }
    }
    progress(options, "extracting", ++completed, chunks.length);
  }

  try {
    const extracted = await glinerPromise;
    const writes = missingGliner.map((chunk) => {
      const result = extracted.get(chunk.chunkId) ?? emptyExtraction();
      gliner.set(chunk.chunkId, result);
      return { key: keys.get(chunk.chunkId)!.gliner, value: result };
    });
    await writeCache(writes);
  } catch (error) {
    throw new Error(
      `GLiNER failed after completed LLM chunks were cached: ${message(error)}`,
    );
  }
  for (const chunk of pending) {
    if (!gliner.has(chunk.chunkId)) {
      gliner.set(chunk.chunkId, emptyExtraction());
    }
  }

  completed = chunks.length - pending.length;
  progress(options, "reconciling", completed, chunks.length);
  for (const chunk of pending) {
    const llmResult = llm.get(chunk.chunkId);
    if (llmResult) {
      try {
        const result = hasUsableText(chunk.content)
          ? await reconcileExtractions(
              chunk.content,
              schema,
              llmResult,
              gliner.get(chunk.chunkId)!,
              options,
            )
          : emptyExtraction();
        final.set(chunk.chunkId, result);
        await writeCache([
          { key: keys.get(chunk.chunkId)!.final, value: result },
        ]);
      } catch (error) {
        failures.push(`${chunk.chunkId}: ${message(error)}`);
      }
    }
    progress(options, "reconciling", ++completed, chunks.length);
  }
  if (failures.length) {
    throw new Error(
      `${failures.length} chunk(s) failed. Completed stages were cached; rerun to resume.\n${failures.join("\n")}`,
    );
  }

  const assertions = resolveAssertions(scope, chunks, final);
  progress(options, "saving", 0, assertions.length);
  await save(scope, signature, schema, options, assertions);
  progress(options, "saving", assertions.length, assertions.length);
  return {
    reused: false,
    chunks: chunks.length,
    graph: graph(schema, assertions),
  };
}

export async function loadKnowledgeGraph(
  documentIds: string[] = [],
): Promise<KnowledgeGraph> {
  await ensureTables();
  const ids = uniqueIds(documentIds);
  const scope = ids.length ? `documents:${hash(ids.join("\0"))}` : "*";
  const build = await databaseClient.execute({
    sql: "SELECT schema_json FROM kg_new_builds WHERE scope_key = ?",
    args: [scope],
  });
  if (!build.rows.length) {
    throw new Error("The requested Knowledge Graph has not been built.");
  }
  const rows = await databaseClient.execute({
    sql: `SELECT id, document_id, chunk_id, subject, subject_type, raw_predicate,
                 canonical_predicate, object_name, object_type, evidence, start_date,
                 end_date, status, extractors
          FROM kg_new_assertions WHERE scope_key = ? ORDER BY chunk_id, id`,
    args: [scope],
  });
  const assertions = rows.rows.map(
    (row) =>
      ({
        id: String(row.id),
        documentId: String(row.document_id),
        chunkId: String(row.chunk_id),
        subject: String(row.subject),
        subjectType: String(row.subject_type),
        rawPredicate: String(row.raw_predicate),
        canonicalPredicate: String(row.canonical_predicate),
        object: String(row.object_name),
        objectType: String(row.object_type),
        evidence: String(row.evidence),
        startDate: row.start_date === null ? null : String(row.start_date),
        endDate: row.end_date === null ? null : String(row.end_date),
        status: String(row.status) as GraphAssertion["status"],
        provenance: provenance(row.extractors, String(row.subject), String(row.object_name)),
      }) satisfies GraphAssertion,
  );
  return graph(
    JSON.parse(String(build.rows[0].schema_json)) as CorpusSchema,
    assertions,
  );
}

async function loadChunks(documentIds: string[]): Promise<GraphChunk[]> {
  const query = db
    .select({
      chunkId: documentChunks.id,
      documentId: documentChunks.documentId,
      content: documentChunks.content,
    })
    .from(documentChunks)
    .orderBy(asc(documentChunks.documentId), asc(documentChunks.chunkIndex));
  const rows = documentIds.length
    ? await query.where(inArray(documentChunks.documentId, documentIds))
    : await query;
  return rows
    .filter((row) => row.content.trim())
    .map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      content: row.content,
    }));
}

function resolveAssertions(
  scope: string,
  chunks: GraphChunk[],
  results: Map<string, ExtractionResult>,
): GraphAssertion[] {
  const rows = chunks.flatMap((chunk) =>
    (results.get(chunk.chunkId)?.assertions ?? []).map((assertion) => ({
      chunk,
      assertion,
    })),
  );
  const names = rows.flatMap(({ assertion }) => [
    assertion.subject,
    assertion.object,
  ]);
  const canonical = new Map(names.map((name) => [normalize(name), name]));
  const expansions = new Map(
    names.flatMap((name) => {
      const acronym = makeAcronym(name);
      return acronym ? [[acronym, name]] : [];
    }),
  );
  for (const name of names) {
    const compact = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (name === name.toUpperCase() && expansions.has(compact)) {
      canonical.set(normalize(name), expansions.get(compact)!);
    }
  }

  return rows.map(({ chunk, assertion }) => {
    const subject =
      canonical.get(normalize(assertion.subject)) ?? assertion.subject;
    const object =
      canonical.get(normalize(assertion.object)) ?? assertion.object;
    return {
      id: hash(
        [
          scope,
          chunk.chunkId,
          subject,
          assertion.rawPredicate,
          object,
          assertion.evidence,
        ].join("\0"),
      ),
      documentId: chunk.documentId,
      chunkId: chunk.chunkId,
      subject,
      subjectType: assertion.subjectType,
      rawPredicate: assertion.rawPredicate,
      canonicalPredicate: predicate(assertion.rawPredicate),
      object,
      objectType: assertion.objectType,
      evidence: assertion.evidence,
      startDate: assertion.startDate,
      endDate: assertion.endDate,
      status: assertion.status,
      provenance: {
        extractors: assertion.extractors,
        verified: assertion.verified,
        score: assertion.score,
        offsets: assertion.offsets,
        rawSubject: assertion.subject,
        rawObject: assertion.object,
      },
    };
  });
}

function graph(
  schema: CorpusSchema,
  assertions: GraphAssertion[],
): KnowledgeGraph {
  const entities = new Map<
    string,
    { name: string; type: string; aliases: string[] }
  >();
  for (const assertion of assertions) {
    for (const [name, type, raw] of [
      [
        assertion.subject,
        assertion.subjectType,
        assertion.provenance.rawSubject,
      ],
      [assertion.object, assertion.objectType, assertion.provenance.rawObject],
    ]) {
      const key = normalize(name);
      const entity = entities.get(key) ?? { name, type, aliases: [] };
      if (entity.type === "unknown" && type !== "unknown") entity.type = type;
      if (normalize(raw) !== key && !entity.aliases.includes(raw)) {
        entity.aliases.push(raw);
      }
      entities.set(key, entity);
    }
  }
  return { schema, entities: [...entities.values()], assertions };
}

async function save(
  scope: string,
  signature: string,
  schema: CorpusSchema,
  options: BuildOptions,
  assertions: GraphAssertion[],
): Promise<void> {
  await databaseClient.execute({
    sql: "DELETE FROM kg_new_assertions WHERE scope_key = ?",
    args: [scope],
  });
  await batch(
    assertions.map((assertion) => ({
      sql: `INSERT INTO kg_new_assertions
        (id, scope_key, document_id, chunk_id, subject, subject_type, raw_predicate,
         canonical_predicate, object_name, object_type, evidence, start_date,
         end_date, status, extractors)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        assertion.id,
        scope,
        assertion.documentId,
        assertion.chunkId,
        assertion.subject,
        assertion.subjectType,
        assertion.rawPredicate,
        assertion.canonicalPredicate,
        assertion.object,
        assertion.objectType,
        assertion.evidence,
        assertion.startDate,
        assertion.endDate,
        assertion.status,
        JSON.stringify(assertion.provenance),
      ],
    })),
  );
  await databaseClient.execute({
    sql: `INSERT INTO kg_new_builds
      (scope_key, signature, provider_id, model_id, schema_json, built_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope_key) DO UPDATE SET
        signature = excluded.signature,
        provider_id = excluded.provider_id,
        model_id = excluded.model_id,
        schema_json = excluded.schema_json,
        built_at = excluded.built_at`,
    args: [
      scope,
      signature,
      options.providerId,
      options.modelId,
      JSON.stringify(schema),
      new Date().toISOString(),
    ],
  });
}

async function ensureTables(): Promise<void> {
  await databaseClient.batch(
    [
      `CREATE TABLE IF NOT EXISTS kg_new_builds (
        scope_key TEXT PRIMARY KEY, signature TEXT NOT NULL,
        provider_id TEXT NOT NULL, model_id TEXT NOT NULL,
        schema_json TEXT NOT NULL, built_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS kg_new_assertions (
        id TEXT PRIMARY KEY, scope_key TEXT NOT NULL, document_id TEXT NOT NULL,
        chunk_id TEXT NOT NULL, subject TEXT NOT NULL, subject_type TEXT NOT NULL,
        raw_predicate TEXT NOT NULL, canonical_predicate TEXT NOT NULL,
        object_name TEXT NOT NULL, object_type TEXT NOT NULL, evidence TEXT NOT NULL,
        start_date TEXT, end_date TEXT, status TEXT NOT NULL, extractors TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS kg_new_assertions_scope_idx ON kg_new_assertions(scope_key)",
      `CREATE TABLE IF NOT EXISTS kg_new_chunk_cache (
        cache_key TEXT PRIMARY KEY, result_json TEXT NOT NULL, created_at TEXT NOT NULL
      )`,
    ],
    "write",
  );
}

async function readCache(): Promise<Map<string, string>> {
  const rows = await databaseClient.execute(
    "SELECT cache_key, result_json FROM kg_new_chunk_cache",
  );
  return new Map(
    rows.rows.map((row) => [
      String(row.cache_key),
      String(row.result_json),
    ]),
  );
}

async function writeCache(
  rows: Array<{ key: string; value: unknown }>,
): Promise<void> {
  await batch(
    rows.map((row) => ({
      sql: `INSERT INTO kg_new_chunk_cache (cache_key, result_json, created_at)
        VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET
        result_json = excluded.result_json, created_at = excluded.created_at`,
      args: [row.key, JSON.stringify(row.value), new Date().toISOString()],
    })),
  );
}

async function batch(
  statements: Array<{ sql: string; args: Array<string | null> }>,
): Promise<void> {
  for (let index = 0; index < statements.length; index += 200) {
    await databaseClient.batch(statements.slice(index, index + 200), "write");
  }
}

function chunkKeys(
  chunk: GraphChunk,
  schema: string,
  options: BuildOptions,
): { llm: string; gliner: string; final: string } {
  const content = hash(chunk.content);
  const llm = cacheKey("llm", {
    content,
    schema,
    llm: llmVersion(options),
    version: VERSION,
  });
  const gliner = cacheKey("gliner", {
    content,
    schema,
    gliner: extractionVersion(),
    enabled: options.useGliner !== false,
  });
  return {
    llm,
    gliner,
    final: cacheKey("final", {
      llm,
      gliner,
      verifier: llmVersion(options),
      version: VERSION,
    }),
  };
}

function provenance(value: unknown, subject: string, object: string): Provenance {
  const fallback: Provenance = {
    extractors: [],
    verified: false,
    score: null,
    offsets: null,
    rawSubject: subject,
    rawObject: object,
  };
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return { ...fallback, extractors: parsed };
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function progress(
  options: BuildOptions,
  stage: Parameters<NonNullable<BuildOptions["onProgress"]>>[0]["stage"],
  completed: number,
  total: number,
): void {
  options.onProgress?.({ stage, completed, total });
}

function llmVersion(options: BuildOptions): unknown {
  return {
    provider: options.providerId,
    model: options.modelId,
    options: options.providerOptions,
  };
}

function cacheKey(stage: string, value: unknown): string {
  return `${stage}:${hash(JSON.stringify(value))}`;
}

function parse<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

function limitChunks(chunks: GraphChunk[], limit?: number): GraphChunk[] {
  if (!limit || limit >= chunks.length) return chunks;
  const count = Math.max(1, Math.floor(limit));
  const step = (chunks.length - 1) / Math.max(1, count - 1);
  return Array.from(
    { length: count },
    (_, index) => chunks[Math.round(index * step)],
  );
}

function makeAcronym(name: string): string | null {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  return words.length < 3
    ? null
    : words.map((word) => word[0]).join("").toUpperCase();
}

function predicate(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
