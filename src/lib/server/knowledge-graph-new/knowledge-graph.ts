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
  logger?: (message: string) => void;
  onProgress?: (progress: {
    stage: "schema" | "extracting" | "reconciling" | "saving";
    completed: number;
    total: number;
  }) => void;
};

export type BuildFailure = {
  stage: "llm" | "gliner" | "reconciling" | "saving";
  chunkId: string | null;
  message: string;
};

export type BuildResult = {
  complete: boolean;
  reused: boolean;
  chunks: number;
  completedChunks: number;
  failures: BuildFailure[];
  graph: KnowledgeGraph;
};

const VERSION = "kg-build-v5";

export async function buildKnowledgeGraph(
  options: BuildOptions,
): Promise<BuildResult> {
  const started = performance.now();
  const log = (text: string) =>
    (options.logger ?? console.log)(
      `[kg ${duration(performance.now() - started)}] ${text}`,
    );
  await ensureTables();
  const documentIds = uniqueIds(options.documentIds ?? []);
  const chunks = limitChunks(
    await loadChunks(documentIds),
    options.chunkLimit,
  );
  if (!chunks.length) throw new Error("No stored document chunks are available.");
  log(`loaded ${chunks.length} chunks`);

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
    log("complete graph cache hit");
    return {
      complete: true,
      reused: true,
      chunks: chunks.length,
      completedChunks: chunks.length,
      failures: [],
      graph: await loadKnowledgeGraph(documentIds),
    };
  }

  const cache = await readCache();
  const schemaStarted = performance.now();
  progress(options, "schema", 0, 1);
  const schemaKey = cacheKey("schema", {
    chunks: chunks.map((chunk) => [chunk.chunkId, hash(chunk.content)]),
    llm: llmVersion(options),
    extraction: extractionVersion(),
  });
  let schema = parse<CorpusSchema>(cache.get(schemaKey));
  if (!schema) {
    log("discovering corpus schema");
    schema = await discoverCorpusSchema(chunks, options);
    await writeCache([{ key: schemaKey, value: schema }]);
    log(`schema discovered in ${duration(performance.now() - schemaStarted)}`);
  } else {
    log(`schema cache hit in ${duration(performance.now() - schemaStarted)}`);
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
  log(
    `cache status: ${final.size} final, ${llm.size} LLM, ${gliner.size} GLiNER; ${pending.length} pending`,
  );

  let cacheQueue = Promise.resolve();
  const cacheResult = (key: string, value: unknown) => {
    const write = cacheQueue.then(() => writeCache([{ key, value }]));
    cacheQueue = write.catch(() => undefined);
    return write;
  };

  const failures: BuildFailure[] = [];
  let glinerCompleted = 0;
  const glinerStarted = performance.now();
  const glinerPromise =
    options.useGliner === false
      ? Promise.resolve<Error | null>(null)
      : runGliner(missingGliner, schema, async (chunkId, result) => {
          gliner.set(chunkId, result);
          await cacheResult(keys.get(chunkId)!.gliner, result);
          glinerCompleted += 1;
          log(
            `GLiNER ${glinerCompleted}/${missingGliner.length} checkpointed (${eta(glinerCompleted, missingGliner.length, glinerStarted)})`,
          );
        }).then(
          () => null,
          (error) => (error instanceof Error ? error : new Error(String(error))),
        );

  let completed = chunks.length - pending.length;
  let attempted = 0;
  const missingLlm = pending.filter((chunk) => !llm.has(chunk.chunkId));
  const extractionStarted = performance.now();
  progress(options, "extracting", completed, chunks.length);
  for (const chunk of pending) {
    if (!llm.has(chunk.chunkId)) {
      const chunkStarted = performance.now();
      try {
        const result = hasUsableText(chunk.content)
          ? await extractWithLlm(chunk, schema, options)
          : emptyExtraction();
        llm.set(chunk.chunkId, result);
        await cacheResult(keys.get(chunk.chunkId)!.llm, result);
        attempted += 1;
        log(
          `LLM ${attempted}/${missingLlm.length} ${chunk.chunkId} took ${duration(performance.now() - chunkStarted)} (${eta(attempted, missingLlm.length, extractionStarted)})`,
        );
      } catch (error) {
        attempted += 1;
        failures.push({
          stage: "llm",
          chunkId: chunk.chunkId,
          message: message(error),
        });
        log(
          `LLM ${attempted}/${missingLlm.length} ${chunk.chunkId} failed after ${duration(performance.now() - chunkStarted)}`,
        );
      }
    }
    progress(options, "extracting", ++completed, chunks.length);
  }

  const glinerError = await glinerPromise;
  await cacheQueue;
  if (glinerError) {
    failures.push({
      stage: "gliner",
      chunkId: null,
      message: glinerError.message,
    });
    log(`GLiNER failed after ${glinerCompleted} checkpoints: ${glinerError.message}`);
  } else if (options.useGliner !== false) {
    log(`GLiNER finished in ${duration(performance.now() - glinerStarted)}`);
  }
  for (const chunk of pending) {
    if (!hasUsableText(chunk.content) || options.useGliner === false) {
      gliner.set(chunk.chunkId, emptyExtraction());
    } else if (!gliner.has(chunk.chunkId) && !glinerError) {
      failures.push({
        stage: "gliner",
        chunkId: chunk.chunkId,
        message: "GLiNER returned no result for this chunk.",
      });
    }
  }

  completed = chunks.length - pending.length;
  attempted = 0;
  const reconcilable = pending.filter(
    (chunk) => llm.has(chunk.chunkId) && gliner.has(chunk.chunkId),
  );
  const reconciliationStarted = performance.now();
  progress(options, "reconciling", completed, chunks.length);
  for (const chunk of pending) {
    const llmResult = llm.get(chunk.chunkId);
    const glinerResult = gliner.get(chunk.chunkId);
    if (llmResult && glinerResult) {
      const chunkStarted = performance.now();
      try {
        const result = hasUsableText(chunk.content)
          ? await reconcileExtractions(
              chunk.content,
              schema,
              llmResult,
              glinerResult,
              options,
            )
          : emptyExtraction();
        final.set(chunk.chunkId, result);
        await cacheResult(keys.get(chunk.chunkId)!.final, result);
        attempted += 1;
        log(
          `reconcile ${attempted}/${reconcilable.length} ${chunk.chunkId} took ${duration(performance.now() - chunkStarted)} (${eta(attempted, reconcilable.length, reconciliationStarted)})`,
        );
      } catch (error) {
        attempted += 1;
        failures.push({
          stage: "reconciling",
          chunkId: chunk.chunkId,
          message: message(error),
        });
        log(
          `reconcile ${attempted}/${reconcilable.length} ${chunk.chunkId} failed after ${duration(performance.now() - chunkStarted)}`,
        );
      }
    }
    progress(options, "reconciling", ++completed, chunks.length);
  }
  await cacheQueue;

  for (const chunk of chunks) {
    if (
      !final.has(chunk.chunkId) &&
      !failures.some((failure) => failure.chunkId === chunk.chunkId) &&
      !glinerError
    ) {
      failures.push({
        stage: "reconciling",
        chunkId: chunk.chunkId,
        message: "Chunk did not produce a final cached result.",
      });
    }
  }

  const assertions = resolveAssertions(scope, chunks, final);
  const resultGraph = graph(schema, assertions);
  if (failures.length) {
    log(
      `partial build: ${final.size}/${chunks.length} chunks complete, ${failures.length} failures; rerun resumes from cache`,
    );
    return {
      complete: false,
      reused: false,
      chunks: chunks.length,
      completedChunks: final.size,
      failures,
      graph: resultGraph,
    };
  }

  const saveStarted = performance.now();
  progress(options, "saving", 0, assertions.length);
  try {
    await save(scope, signature, schema, options, assertions);
  } catch (error) {
    failures.push({
      stage: "saving",
      chunkId: null,
      message: message(error),
    });
    log(
      `final save failed after ${duration(performance.now() - saveStarted)}; the previous complete graph was preserved`,
    );
    return {
      complete: false,
      reused: false,
      chunks: chunks.length,
      completedChunks: chunks.length,
      failures,
      graph: resultGraph,
    };
  }
  progress(options, "saving", assertions.length, assertions.length);
  log(
    `saved ${resultGraph.entities.length} entities and ${assertions.length} assertions in ${duration(performance.now() - saveStarted)}`,
  );
  log(`complete in ${duration(performance.now() - started)}`);
  return {
    complete: true,
    reused: false,
    chunks: chunks.length,
    completedChunks: chunks.length,
    failures: [],
    graph: resultGraph,
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

export function tripletsCsv(graph: KnowledgeGraph): string {
  const rows = graph.assertions.map((assertion) => [
    assertion.subject,
    assertion.subjectType,
    assertion.canonicalPredicate,
    assertion.rawPredicate,
    assertion.object,
    assertion.objectType,
    assertion.status,
    assertion.startDate,
    assertion.endDate,
    assertion.provenance.extractors.join("+"),
    assertion.provenance.verified,
    assertion.provenance.score,
    assertion.documentId,
    assertion.chunkId,
    assertion.evidence,
  ]);
  return [
    [
      "subject",
      "subject_type",
      "predicate",
      "raw_predicate",
      "object",
      "object_type",
      "status",
      "start_date",
      "end_date",
      "extractors",
      "verified",
      "score",
      "document_id",
      "chunk_id",
      "evidence",
    ],
    ...rows,
  ]
    .map((row) => row.map(csv).join(","))
    .join("\n");
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
  const transaction = await databaseClient.transaction("write");
  try {
    await transaction.execute({
      sql: "DELETE FROM kg_new_assertions WHERE scope_key = ?",
      args: [scope],
    });
    const statements = assertions.map((assertion) => ({
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
    }));
    for (let index = 0; index < statements.length; index += 200) {
      await transaction.batch(statements.slice(index, index + 200));
    }
    const memory = memoryStatements(schema, assertions);
    for (let index = 0; index < memory.length; index += 200) {
      await transaction.batch(memory.slice(index, index + 200));
    }
    await transaction.execute({
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
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  } finally {
    transaction.close();
  }
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
      `CREATE TABLE IF NOT EXISTS kg_new_entity_memory (
        canonical_name TEXT PRIMARY KEY, entity_type TEXT NOT NULL,
        aliases_json TEXT NOT NULL, sources_json TEXT NOT NULL,
        approved INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS kg_new_relation_memory (
        canonical_predicate TEXT PRIMARY KEY, description TEXT NOT NULL,
        aliases_json TEXT NOT NULL, subject_types_json TEXT NOT NULL,
        object_types_json TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )`,
    ],
    "write",
  );
}

function memoryStatements(
  schema: CorpusSchema,
  assertions: GraphAssertion[],
): Array<{ sql: string; args: Array<string | null> }> {
  const updatedAt = new Date().toISOString();
  const entities = new Map<
    string,
    {
      name: string;
      type: string;
      aliases: Set<string>;
      sources: Set<string>;
    }
  >();
  for (const assertion of assertions) {
    for (const [name, type, raw] of [
      [
        assertion.subject,
        assertion.subjectType,
        assertion.provenance.rawSubject,
      ],
      [assertion.object, assertion.objectType, assertion.provenance.rawObject],
    ] as const) {
      const key = normalize(name);
      const entity =
        entities.get(key) ??
        {
          name,
          type,
          aliases: new Set<string>(),
          sources: new Set<string>(),
        };
      if (entity.type === "unknown" && type !== "unknown") entity.type = type;
      if (normalize(raw) !== key) entity.aliases.add(raw);
      entity.sources.add(assertion.documentId);
      entities.set(key, entity);
    }
  }
  const entityStatements = [...entities.values()].map((entity) => ({
    sql: `INSERT INTO kg_new_entity_memory
      (canonical_name, entity_type, aliases_json, sources_json, approved, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(canonical_name) DO UPDATE SET
        entity_type = CASE
          WHEN kg_new_entity_memory.entity_type IN ('unknown', 'other')
          THEN excluded.entity_type
          ELSE kg_new_entity_memory.entity_type
        END,
        aliases_json = excluded.aliases_json,
        sources_json = excluded.sources_json,
        approved = 1,
        updated_at = excluded.updated_at`,
    args: [
      entity.name,
      entity.type,
      JSON.stringify([...entity.aliases].sort()),
      JSON.stringify([...entity.sources].sort()),
      updatedAt,
    ],
  }));
  const relationStatements = schema.relationTypes.map((relation) => ({
    sql: `INSERT INTO kg_new_relation_memory
      (canonical_predicate, description, aliases_json, subject_types_json,
       object_types_json, approved, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(canonical_predicate) DO UPDATE SET
        description = excluded.description,
        aliases_json = excluded.aliases_json,
        subject_types_json = excluded.subject_types_json,
        object_types_json = excluded.object_types_json,
        approved = 1,
        updated_at = excluded.updated_at`,
    args: [
      relation.name,
      relation.description,
      JSON.stringify(relation.aliases ?? []),
      JSON.stringify(relation.subjectTypes ?? []),
      JSON.stringify(relation.objectTypes ?? []),
      updatedAt,
    ],
  }));
  return [...entityStatements, ...relationStatements];
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

function csv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function duration(milliseconds: number): string {
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function eta(completed: number, total: number, started: number): string {
  if (!completed || completed >= total) return "ETA 0s";
  const remaining = ((performance.now() - started) / completed) * (total - completed);
  return `ETA ${duration(remaining)}`;
}
