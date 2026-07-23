import { createHash } from "node:crypto";
import { asc, inArray } from "drizzle-orm";
import { databaseClient, db } from "$lib/server/database/database";
import { document_chunks as documentChunks } from "$lib/server/database/schema";
import {
  discoverCorpusSchema,
  extractChunks,
  type CorpusSchema,
  type ExtractionResult,
  type ExtractionSettings,
  type GraphChunk,
} from "./extraction";

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
  extractors: Array<"llm" | "gliner">;
};

export type GraphEntity = {
  name: string;
  type: string;
  aliases: string[];
};

export type KnowledgeGraph = {
  schema: CorpusSchema;
  entities: GraphEntity[];
  assertions: GraphAssertion[];
};

export type BuildOptions = ExtractionSettings & {
  documentIds?: string[];
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

type ChunkCacheEntry = {
  llm?: ExtractionResult;
  final?: ExtractionResult;
};

const BUILD_VERSION = "2";

export async function buildKnowledgeGraph(
  options: BuildOptions,
): Promise<BuildResult> {
  await ensureTables();
  const documentIds = [
    ...new Set(
      options.documentIds?.map((id) => id.trim()).filter(Boolean) ?? [],
    ),
  ].sort();
  const chunks = await loadChunks(documentIds);
  if (!chunks.length)
    throw new Error(
      "No stored document chunks are available for Knowledge Graph construction.",
    );

  const scopeKey = graphScopeKey(documentIds);
  const signature = buildSignature(chunks, options);
  const existing = await databaseClient.execute({
    sql: "SELECT signature FROM kg_new_builds WHERE scope_key = ?",
    args: [scopeKey],
  });
  if (
    !options.force &&
    String(existing.rows[0]?.signature ?? "") === signature
  ) {
    return {
      reused: true,
      chunks: chunks.length,
      graph: await loadKnowledgeGraph(documentIds),
    };
  }

  options.onProgress?.({ stage: "schema", completed: 0, total: 1 });
  const schema = await loadOrDiscoverSchema(chunks, options);
  options.onProgress?.({ stage: "schema", completed: 1, total: 1 });

  const schemaHash = hash(JSON.stringify(schema));
  const cachedRows = await databaseClient.execute(
    "SELECT cache_key, result_json FROM kg_new_chunk_cache",
  );
  const stored = new Map(
    cachedRows.rows.map((row) => [
      String(row.cache_key),
      String(row.result_json),
    ]),
  );
  const entries = new Map<string, ChunkCacheEntry>();
  const llm = new Map<string, ExtractionResult>();
  const final = new Map<string, ExtractionResult>();

  for (const chunk of chunks) {
    const key = chunkCacheKey(chunk, schemaHash, options);
    const entry = parseCacheEntry(stored.get(key));
    entries.set(chunk.chunkId, entry);
    if (entry.llm) llm.set(chunk.chunkId, entry.llm);
    if (entry.final) final.set(chunk.chunkId, entry.final);
  }

  const checkpoint = async (
    chunk: GraphChunk,
    stage: keyof ChunkCacheEntry,
    result: ExtractionResult,
  ): Promise<void> => {
    const entry = { ...entries.get(chunk.chunkId) };
    entry[stage] = result;
    await writeCache([
      {
        key: chunkCacheKey(chunk, schemaHash, options),
        result: JSON.stringify(entry),
      },
    ]);
    entries.set(chunk.chunkId, entry);
  };

  const results = await extractChunks(chunks, schema, options, {
    llm,
    final,
    onLlm: (chunk, result) => checkpoint(chunk, "llm", result),
    onFinal: (chunk, result) => checkpoint(chunk, "final", result),
    onProgress: (completed, total) => {
      options.onProgress?.({ stage: "extracting", completed, total });
    },
    onReconcileProgress: (completed, total) => {
      options.onProgress?.({ stage: "reconciling", completed, total });
    },
  });

  const assertions = resolveAssertions(scopeKey, chunks, results);
  options.onProgress?.({
    stage: "saving",
    completed: 0,
    total: assertions.length,
  });
  await saveBuild(scopeKey, signature, schema, options, assertions);
  options.onProgress?.({
    stage: "saving",
    completed: assertions.length,
    total: assertions.length,
  });

  return {
    reused: false,
    chunks: chunks.length,
    graph: buildGraph(schema, assertions),
  };
}

export async function loadKnowledgeGraph(
  documentIds: string[] = [],
): Promise<KnowledgeGraph> {
  await ensureTables();
  const scopeKey = graphScopeKey(
    [...new Set(documentIds.map((id) => id.trim()).filter(Boolean))].sort(),
  );
  const build = await databaseClient.execute({
    sql: "SELECT schema_json FROM kg_new_builds WHERE scope_key = ?",
    args: [scopeKey],
  });
  if (!build.rows.length)
    throw new Error("The requested Knowledge Graph has not been built.");

  const rows = await databaseClient.execute({
    sql: `SELECT id, document_id, chunk_id, subject, subject_type, raw_predicate,
                 canonical_predicate, object_name, object_type, evidence, start_date,
                 end_date, status, extractors
          FROM kg_new_assertions WHERE scope_key = ? ORDER BY chunk_id, id`,
    args: [scopeKey],
  });
  const assertions = rows.rows.map((row) => ({
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
    extractors: JSON.parse(
      String(row.extractors),
    ) as GraphAssertion["extractors"],
  }));

  return buildGraph(
    JSON.parse(String(build.rows[0].schema_json)) as CorpusSchema,
    assertions,
  );
}

export function findKnowledgePaths(
  graph: KnowledgeGraph,
  source: string,
  target: string,
  maxDepth = 2,
): GraphAssertion[][] {
  const sourceName = resolveEntityName(graph.entities, source);
  const targetName = resolveEntityName(graph.entities, target);
  if (!sourceName || !targetName) return [];

  const outgoing = new Map<string, GraphAssertion[]>();
  for (const assertion of graph.assertions) {
    if (assertion.status !== "asserted") continue;
    const rows = outgoing.get(normalize(assertion.subject)) ?? [];
    rows.push(assertion);
    outgoing.set(normalize(assertion.subject), rows);
  }

  const paths: GraphAssertion[][] = [];
  const queue: Array<{
    entity: string;
    path: GraphAssertion[];
    seen: Set<string>;
  }> = [
    {
      entity: sourceName,
      path: [],
      seen: new Set([normalize(sourceName)]),
    },
  ];

  while (queue.length) {
    const current = queue.shift()!;
    if (current.path.length >= Math.max(1, maxDepth)) continue;
    for (const assertion of outgoing.get(normalize(current.entity)) ?? []) {
      const next = assertion.object;
      const path = [...current.path, assertion];
      if (normalize(next) === normalize(targetName)) paths.push(path);
      else if (!current.seen.has(normalize(next))) {
        queue.push({
          entity: next,
          path,
          seen: new Set([...current.seen, normalize(next)]),
        });
      }
    }
  }

  return paths.sort((left, right) => left.length - right.length);
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
  scopeKey: string,
  chunks: GraphChunk[],
  results: Map<string, ExtractionResult>,
): GraphAssertion[] {
  const all = chunks.flatMap((chunk) => {
    const result = results.get(chunk.chunkId);
    return (result?.assertions ?? []).map((assertion) => ({
      chunk,
      assertion,
    }));
  });
  const names = all.flatMap(({ assertion }) => [
    { name: assertion.subject, type: assertion.subjectType },
    { name: assertion.object, type: assertion.objectType },
  ]);
  const canonical = canonicalNames(names);

  return all.map(({ chunk, assertion }) => {
    const subject =
      canonical.get(normalize(assertion.subject)) ?? assertion.subject;
    const object =
      canonical.get(normalize(assertion.object)) ?? assertion.object;
    return {
      id: hash(
        [
          scopeKey,
          chunk.chunkId,
          subject,
          assertion.rawPredicate,
          object,
          assertion.evidence,
        ].join("\u0000"),
      ),
      documentId: chunk.documentId,
      chunkId: chunk.chunkId,
      subject,
      subjectType: assertion.subjectType,
      rawPredicate: assertion.rawPredicate,
      canonicalPredicate: predicateName(assertion.rawPredicate),
      object,
      objectType: assertion.objectType,
      evidence: assertion.evidence,
      startDate: assertion.startDate,
      endDate: assertion.endDate,
      status: assertion.status,
      extractors: assertion.extractors,
    };
  });
}

function canonicalNames(
  names: Array<{ name: string; type: string }>,
): Map<string, string> {
  const canonical = new Map<string, string>();
  const acronymTargets = new Map<string, string>();
  for (const item of names) {
    const key = normalize(item.name);
    if (!canonical.has(key)) canonical.set(key, item.name);
    const acronym = makeAcronym(item.name);
    if (acronym) acronymTargets.set(acronym, item.name);
  }
  for (const item of names) {
    const compact = item.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (compact.length >= 3 && item.name === item.name.toUpperCase()) {
      const expanded = acronymTargets.get(compact);
      if (expanded) canonical.set(normalize(item.name), expanded);
    }
  }
  return canonical;
}

function buildGraph(
  schema: CorpusSchema,
  assertions: GraphAssertion[],
): KnowledgeGraph {
  const entities = new Map<string, GraphEntity>();
  for (const assertion of assertions) {
    addEntity(entities, assertion.subject, assertion.subjectType);
    addEntity(entities, assertion.object, assertion.objectType);
  }
  return { schema, entities: [...entities.values()], assertions };
}

function addEntity(
  entities: Map<string, GraphEntity>,
  name: string,
  type: string,
): void {
  const key = normalize(name);
  const existing = entities.get(key);
  if (!existing) entities.set(key, { name, type, aliases: [] });
  else if (existing.type === "unknown" && type !== "unknown")
    existing.type = type;
}

function resolveEntityName(
  entities: GraphEntity[],
  query: string,
): string | null {
  const normalized = normalize(query);
  const exact = entities.find(
    (entity) =>
      normalize(entity.name) === normalized ||
      entity.aliases.some((alias) => normalize(alias) === normalized) ||
      makeAcronym(entity.name)?.toLowerCase() ===
        query.replace(/[^A-Za-z0-9]/g, "").toLowerCase(),
  );
  if (exact) return exact.name;
  const partial = entities.filter(
    (entity) =>
      normalize(entity.name).includes(normalized) ||
      normalized.includes(normalize(entity.name)),
  );
  return partial.length === 1 ? partial[0].name : null;
}

async function saveBuild(
  scopeKey: string,
  signature: string,
  schema: CorpusSchema,
  options: BuildOptions,
  assertions: GraphAssertion[],
): Promise<void> {
  await databaseClient.execute({
    sql: "DELETE FROM kg_new_assertions WHERE scope_key = ?",
    args: [scopeKey],
  });
  await runBatches(
    assertions.map((assertion) => ({
      sql: `INSERT INTO kg_new_assertions
      (id, scope_key, document_id, chunk_id, subject, subject_type, raw_predicate,
       canonical_predicate, object_name, object_type, evidence, start_date, end_date,
       status, extractors)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        assertion.id,
        scopeKey,
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
        JSON.stringify(assertion.extractors),
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
      scopeKey,
      signature,
      options.providerId,
      options.modelId,
      JSON.stringify(schema),
      new Date().toISOString(),
    ],
  });
}

async function loadOrDiscoverSchema(
  chunks: GraphChunk[],
  options: BuildOptions,
): Promise<CorpusSchema> {
  const key = schemaCacheKey(chunks, options);
  const cached = await databaseClient.execute({
    sql: "SELECT schema_json FROM kg_new_schema_cache WHERE cache_key = ?",
    args: [key],
  });
  if (cached.rows.length) {
    return JSON.parse(String(cached.rows[0].schema_json)) as CorpusSchema;
  }

  const schema = await discoverCorpusSchema(chunks, options);
  await databaseClient.execute({
    sql: `INSERT INTO kg_new_schema_cache (cache_key, schema_json, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        schema_json = excluded.schema_json,
        created_at = excluded.created_at`,
    args: [key, JSON.stringify(schema), new Date().toISOString()],
  });
  return schema;
}

async function writeCache(
  rows: Array<{ key: string; result: string }>,
): Promise<void> {
  await runBatches(
    rows.map((row) => ({
      sql: `INSERT INTO kg_new_chunk_cache (cache_key, result_json, created_at)
          VALUES (?, ?, ?)
          ON CONFLICT(cache_key) DO UPDATE SET
            result_json = excluded.result_json,
            created_at = excluded.created_at`,
      args: [row.key, row.result, new Date().toISOString()],
    })),
  );
}

async function runBatches(
  statements: Array<{ sql: string; args: Array<string | null> }>,
): Promise<void> {
  for (let index = 0; index < statements.length; index += 200) {
    await databaseClient.batch(statements.slice(index, index + 200), "write");
  }
}

async function ensureTables(): Promise<void> {
  await databaseClient.batch(
    [
      `CREATE TABLE IF NOT EXISTS kg_new_builds (
      scope_key TEXT PRIMARY KEY,
      signature TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      built_at TEXT NOT NULL
    )`,
      `CREATE TABLE IF NOT EXISTS kg_new_assertions (
      id TEXT PRIMARY KEY,
      scope_key TEXT NOT NULL,
      document_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      raw_predicate TEXT NOT NULL,
      canonical_predicate TEXT NOT NULL,
      object_name TEXT NOT NULL,
      object_type TEXT NOT NULL,
      evidence TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL,
      extractors TEXT NOT NULL
    )`,
      "CREATE INDEX IF NOT EXISTS kg_new_assertions_scope_idx ON kg_new_assertions(scope_key)",
      "CREATE INDEX IF NOT EXISTS kg_new_assertions_subject_idx ON kg_new_assertions(scope_key, subject)",
      "CREATE INDEX IF NOT EXISTS kg_new_assertions_object_idx ON kg_new_assertions(scope_key, object_name)",
      `CREATE TABLE IF NOT EXISTS kg_new_chunk_cache (
      cache_key TEXT PRIMARY KEY,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
      `CREATE TABLE IF NOT EXISTS kg_new_schema_cache (
      cache_key TEXT PRIMARY KEY,
      schema_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    ],
    "write",
  );
}

function graphScopeKey(documentIds: string[]): string {
  return documentIds.length
    ? `documents:${hash(documentIds.join("\u0000"))}`
    : "*";
}

function buildSignature(chunks: GraphChunk[], options: BuildOptions): string {
  return hash(
    JSON.stringify({
      version: BUILD_VERSION,
      providerId: options.providerId,
      modelId: options.modelId,
      providerOptions: options.providerOptions,
      useGliner: options.useGliner !== false,
      chunks: chunks.map((chunk) => [
        chunk.chunkId,
        chunk.documentId,
        hash(chunk.content),
      ]),
    }),
  );
}

function chunkCacheKey(
  chunk: GraphChunk,
  schemaHash: string,
  options: BuildOptions,
): string {
  return hash(
    JSON.stringify({
      version: BUILD_VERSION,
      chunkId: chunk.chunkId,
      content: hash(chunk.content),
      schemaHash,
      providerId: options.providerId,
      modelId: options.modelId,
      providerOptions: options.providerOptions,
      useGliner: options.useGliner !== false,
    }),
  );
}

function schemaCacheKey(chunks: GraphChunk[], options: BuildOptions): string {
  return hash(
    JSON.stringify({
      version: BUILD_VERSION,
      providerId: options.providerId,
      modelId: options.modelId,
      providerOptions: options.providerOptions,
      chunks: chunks.map((chunk) => [chunk.chunkId, hash(chunk.content)]),
    }),
  );
}

function parseCacheEntry(value: string | undefined): ChunkCacheEntry {
  if (!value) return {};
  try {
    return JSON.parse(value) as ChunkCacheEntry;
  } catch {
    return {};
  }
}

function makeAcronym(name: string): string | null {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length < 3) return null;
  const acronym = words
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return acronym.length >= 3 ? acronym : null;
}

function predicateName(value: string): string {
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
