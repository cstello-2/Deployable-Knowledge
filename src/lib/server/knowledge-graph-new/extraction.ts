import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
};

export type CorpusSchema = {
  entityTypes: SchemaCategory[];
  relationTypes: SchemaCategory[];
};

export type ExtractedEntity = {
  mention: string;
  type: string;
  start: number;
  end: number;
};

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
  extractors: Array<"llm" | "gliner">;
};

export type ExtractionResult = {
  entities: ExtractedEntity[];
  assertions: ExtractedAssertion[];
};

export type ExtractionSettings = {
  providerId: string;
  modelId: string;
  providerOptions?: ProviderChatOptions;
  useGliner?: boolean;
};

export type ExtractionCheckpoints = {
  llm?: ReadonlyMap<string, ExtractionResult>;
  final?: ReadonlyMap<string, ExtractionResult>;
  onLlm?: (chunk: GraphChunk, result: ExtractionResult) => Promise<void>;
  onFinal?: (chunk: GraphChunk, result: ExtractionResult) => Promise<void>;
  onProgress?: (completed: number, total: number) => void;
  onReconcileProgress?: (completed: number, total: number) => void;
};

const UNIVERSAL_ENTITIES: SchemaCategory[] = [
  ["person", "A named individual"],
  [
    "organization",
    "A named organization, institution, company, or government body",
  ],
  ["location", "A named geographic place"],
  ["event", "A named historical, political, scientific, or operational event"],
  ["document", "A named law, treaty, standard, publication, or other document"],
  ["system", "A named technical, organizational, or conceptual system"],
  ["component", "A named component belonging to a larger system"],
  ["material", "A named substance or material"],
  ["process", "A named procedure, operation, or process"],
  ["method", "A named technique, doctrine, or analytical method"],
  ["date", "A date or named time period"],
].map(([name, description]) => ({ name, description }));

const UNIVERSAL_RELATIONS: SchemaCategory[] = [
  ["part_of", "The subject belongs to or is a component of the object"],
  [
    "created_by",
    "The subject was created, authored, founded, or developed by the object",
  ],
  ["used_by", "The subject is used or operated by the object"],
  [
    "located_in",
    "The subject is physically or organizationally located in the object",
  ],
  ["caused", "The subject caused or directly produced the object"],
  ["preceded", "The subject occurred or existed before the object"],
  ["succeeded", "The subject replaced or followed the object"],
  ["participated_in", "The subject took part in the object"],
].map(([name, description]) => ({ name, description }));

export async function discoverCorpusSchema(
  chunks: GraphChunk[],
  settings: ExtractionSettings,
): Promise<CorpusSchema> {
  const sample = sampleChunks(chunks, 18)
    .map((chunk, index) => `[${index + 1}] ${chunk.content}`)
    .join("\n\n")
    .slice(0, 16_000);

  if (!sample) {
    return {
      entityTypes: UNIVERSAL_ENTITIES,
      relationTypes: UNIVERSAL_RELATIONS,
    };
  }

  const parsed = await askModelJson(
    settings,
    `You are preparing a compact information-extraction schema for an unfamiliar corpus.

Return JSON only in this shape:
{
  "entityTypes": [{"name":"short category", "description":"what belongs in it"}],
  "relationTypes": [{"name":"short directional relation", "description":"subject-to-object meaning"}]
}

Propose recurring domain categories that complement ordinary people, organizations, places, dates, documents, events, systems, components, materials, processes, and methods. Propose relationships that are likely to recur and are explicitly stated in the text. Categories must be reusable types, never names of actual entities. Keep the schema small and avoid synonyms.

Corpus sample:
${sample}`,
    1_200,
  );

  if (!parsed)
    throw new Error(
      "The model did not return valid JSON for corpus schema discovery.",
    );
  const entityTypes = mergeCategories(
    UNIVERSAL_ENTITIES,
    readCategories(parsed?.entityTypes).slice(0, 13),
  );
  const relationTypes = mergeCategories(
    UNIVERSAL_RELATIONS,
    readCategories(parsed?.relationTypes).slice(0, 24),
  );

  return { entityTypes, relationTypes };
}

export async function extractChunks(
  chunks: GraphChunk[],
  schema: CorpusSchema,
  settings: ExtractionSettings,
  checkpoints: ExtractionCheckpoints = {},
): Promise<Map<string, ExtractionResult>> {
  const final = new Map(checkpoints.final);
  const pending = chunks.filter((chunk) => !final.has(chunk.chunkId));
  const usableChunkIds = new Set(
    pending
      .filter((chunk) => hasUsableText(chunk.content))
      .map((chunk) => chunk.chunkId),
  );
  const glinerPromise = (
    settings.useGliner === false
      ? Promise.resolve(new Map<string, ExtractionResult>())
      : runGliner(
          pending.filter((chunk) => usableChunkIds.has(chunk.chunkId)),
          schema,
        )
  )
    .then((value) => ({ value, error: null as unknown }))
    .catch((error: unknown) => ({
      value: new Map<string, ExtractionResult>(),
      error,
    }));
  const llm = new Map(checkpoints.llm);
  const failures: string[] = [];
  let completed =
    chunks.length - pending.filter((chunk) => !llm.has(chunk.chunkId)).length;
  checkpoints.onProgress?.(completed, chunks.length);

  for (const chunk of pending) {
    if (llm.has(chunk.chunkId)) continue;
    try {
      const result = usableChunkIds.has(chunk.chunkId)
        ? await extractWithLlm(chunk, schema, settings)
        : emptyResult();
      await checkpoints.onLlm?.(chunk, result);
      llm.set(chunk.chunkId, result);
    } catch (error) {
      failures.push(`${chunk.chunkId}: ${errorMessage(error)}`);
    }
    completed += 1;
    checkpoints.onProgress?.(completed, chunks.length);
  }

  const glinerOutcome = await glinerPromise;
  if (glinerOutcome.error) {
    throw new Error(
      `GLiNER failed after successful LLM chunks were cached: ${errorMessage(glinerOutcome.error)}`,
    );
  }
  const gliner = glinerOutcome.value;
  const output = new Map(final);
  let reconciled = chunks.length - pending.length;
  checkpoints.onReconcileProgress?.(reconciled, chunks.length);

  for (const chunk of pending) {
    const llmResult = llm.get(chunk.chunkId);
    if (llmResult) {
      try {
        const merged = mergeExtractions(
          llmResult,
          gliner.get(chunk.chunkId) ?? emptyResult(),
        );
        const glinerOnly = merged.assertions.filter(
          (assertion) =>
            assertion.extractors.length === 1 &&
            assertion.extractors[0] === "gliner",
        );

        if (glinerOnly.length) {
          const accepted = await verifyAssertions(
            chunk.content,
            glinerOnly,
            settings,
          );
          merged.assertions = merged.assertions.filter(
            (assertion) =>
              assertion.extractors.includes("llm") ||
              accepted.has(assertionKey(assertion)),
          );
        }

        await checkpoints.onFinal?.(chunk, merged);
        output.set(chunk.chunkId, merged);
      } catch (error) {
        failures.push(`${chunk.chunkId}: ${errorMessage(error)}`);
      }
    }
    reconciled += 1;
    checkpoints.onReconcileProgress?.(reconciled, chunks.length);
  }

  if (failures.length) {
    throw new Error(
      `${failures.length} chunk(s) failed. Successful chunks were cached; rerun the same command to resume.\n${failures.join("\n")}`,
    );
  }

  return output;
}

async function extractWithLlm(
  chunk: GraphChunk,
  schema: CorpusSchema,
  settings: ExtractionSettings,
): Promise<ExtractionResult> {
  const entityHint = schema.entityTypes.map((item) => item.name).join(", ");
  const relationHint = schema.relationTypes.map((item) => item.name).join(", ");
  const prompt = `Extract a small, source-grounded knowledge graph from the document chunk below.

Return JSON only:
{
  "entities": [{"mention":"exact text", "type":"short category"}],
  "assertions": [{
    "subject":"exact entity text",
    "subjectType":"short category",
    "rawPredicate":"short directional verb phrase",
    "object":"exact entity text",
    "objectType":"short category",
    "evidence":"exact unchanged substring from the chunk",
    "startDate":null,
    "endDate":null,
    "status":"asserted"
  }]
}

Rules:
- Extract only meaningful, explicitly stated relationships.
- Subject, object, and evidence must be copied exactly from the chunk.
- Both endpoints must occur in the evidence.
- Preserve relationship direction, negation, uncertainty, and stated dates.
- Use status "negated" or "uncertain" when appropriate.
- Do not connect entities merely because they occur near each other.
- Do not extract headings, navigation, formatting, or every noun phrase.
- Return empty arrays when the chunk contains no useful relationship.
- Suggested entity categories: ${entityHint}.
- Suggested relationship categories: ${relationHint}.
- These suggestions are not restrictions. Use a precise new type or predicate when needed.

Chunk:
${chunk.content}`;

  const parsed = await askModelJson(settings, prompt, 1_500);
  if (!parsed)
    throw new Error(
      `The model did not return valid extraction JSON for chunk ${chunk.chunkId} after three attempts.`,
    );
  return parseExtraction(parsed, chunk.content, "llm");
}

async function verifyAssertions(
  text: string,
  assertions: ExtractedAssertion[],
  settings: ExtractionSettings,
): Promise<Set<string>> {
  const candidates = assertions.map((assertion, index) => ({
    index,
    subject: assertion.subject,
    predicate: assertion.rawPredicate,
    object: assertion.object,
    evidence: assertion.evidence,
  }));
  const parsed = await askModelJson(
    settings,
    `Check whether each proposed relationship is explicitly stated by its evidence in the document chunk. Reject co-occurrence, implication, wrong direction, and unsupported wording.

Return JSON only: {"accepted":[0,2]}

Chunk:
${text}

Candidates:
${JSON.stringify(candidates)}`,
    500,
  );
  if (!parsed)
    throw new Error(
      "The model did not return valid JSON while verifying GLiNER assertions.",
    );
  const accepted = parsed.accepted;
  const indexes = Array.isArray(accepted)
    ? new Set(
        accepted.filter((value): value is number => Number.isInteger(value)),
      )
    : new Set<number>();

  return new Set(
    assertions.filter((_, index) => indexes.has(index)).map(assertionKey),
  );
}

function mergeExtractions(
  llm: ExtractionResult,
  gliner: ExtractionResult,
): ExtractionResult {
  const entities = new Map<string, ExtractedEntity>();
  for (const entity of [...llm.entities, ...gliner.entities]) {
    const key = normalize(entity.mention);
    const existing = entities.get(key);
    if (!existing || existing.type === "unknown") entities.set(key, entity);
  }

  const assertions = [...llm.assertions];
  for (const candidate of gliner.assertions) {
    const match = assertions.find((assertion) =>
      sameAssertion(assertion, candidate),
    );
    if (match) {
      match.extractors = ["llm", "gliner"];
      continue;
    }
    assertions.push(candidate);
  }

  return { entities: [...entities.values()], assertions };
}

function parseExtraction(
  value: Record<string, unknown> | null,
  text: string,
  extractor: "llm" | "gliner",
): ExtractionResult {
  if (!value) return emptyResult();
  const rawEntities = Array.isArray(value.entities) ? value.entities : [];
  const entities = rawEntities.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const mention = clean(record.mention ?? record.text ?? record.name);
    if (!mention) return [];
    const startValue = Number(record.start);
    const start =
      Number.isInteger(startValue) && startValue >= 0
        ? startValue
        : text.indexOf(mention);
    if (start < 0 || text.slice(start, start + mention.length) !== mention)
      return [];
    return [
      {
        mention,
        type: categoryName(record.type ?? record.label) || "unknown",
        start,
        end: start + mention.length,
      },
    ];
  });
  const entityTypes = new Map(
    entities.map((entity) => [normalize(entity.mention), entity.type]),
  );
  const rawAssertions = Array.isArray(value.assertions)
    ? value.assertions
    : Array.isArray(value.relations)
      ? value.relations
      : [];
  const assertions = rawAssertions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const subject = clean(record.subject ?? record.source ?? record.head);
    const object = clean(record.object ?? record.target ?? record.tail);
    const rawPredicate = categoryName(
      record.rawPredicate ?? record.predicate ?? record.relation,
    );
    const evidence = clean(record.evidence);
    if (
      !subject ||
      !object ||
      !rawPredicate ||
      !evidence ||
      normalize(subject) === normalize(object) ||
      !text.includes(evidence) ||
      !evidence.includes(subject) ||
      !evidence.includes(object)
    )
      return [];

    const rawStatus = clean(record.status).toLowerCase();
    const status =
      rawStatus === "negated" || rawStatus === "uncertain"
        ? rawStatus
        : "asserted";
    return [
      {
        subject,
        subjectType:
          categoryName(record.subjectType) ||
          entityTypes.get(normalize(subject)) ||
          "unknown",
        rawPredicate,
        object,
        objectType:
          categoryName(record.objectType) ||
          entityTypes.get(normalize(object)) ||
          "unknown",
        evidence,
        startDate: nullableText(record.startDate),
        endDate: nullableText(record.endDate),
        status,
        extractors: [extractor],
      } satisfies ExtractedAssertion,
    ];
  });

  return {
    entities,
    assertions: [
      ...new Map(assertions.map((item) => [assertionKey(item), item])).values(),
    ],
  };
}

async function runGliner(
  chunks: GraphChunk[],
  schema: CorpusSchema,
): Promise<Map<string, ExtractionResult>> {
  if (!chunks.length) return new Map();
  const script = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "gliner-extractor.py",
  );
  const python =
    process.env.KNOWLEDGE_GRAPH_PYTHON || process.env.PYTHON || firstPython();
  const payload = {
    chunks,
    entityTypes: schema.entityTypes.map((item) => item.name),
    relationTypes: schema.relationTypes.map((item) => item.name),
  };

  const raw = await new Promise<string>((resolveOutput, reject) => {
    const child = spawn(python, [script], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolveOutput(stdout);
      else
        reject(new Error(stderr.trim() || `GLiNER exited with code ${code}`));
    });
    child.stdin.end(JSON.stringify(payload));
  });

  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
  return new Map(
    parsed.map((item) => {
      const chunkId = String(item.chunkId ?? "");
      const chunk = chunks.find((candidate) => candidate.chunkId === chunkId);
      return [
        chunkId,
        chunk ? parseExtraction(item, chunk.content, "gliner") : emptyResult(),
      ];
    }),
  );
}

async function askModel(
  settings: ExtractionSettings,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  const provider = getProvider(settings.providerId);
  let output = "";
  for await (const part of provider.chat(prompt, settings.modelId, {
    temperature: 0,
    topK: 20,
    ...settings.providerOptions,
    json: true,
    maxTokens: settings.providerOptions?.maxTokens ?? maxTokens,
  }))
    output += part;
  return output;
}

async function askModelJson(
  settings: ExtractionSettings,
  prompt: string,
  maxTokens: number,
): Promise<Record<string, unknown> | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const reminder =
        attempt === 1
          ? ""
          : `\n\nAttempt ${attempt}: Return one shorter, valid JSON object only. If uncertain, use empty arrays rather than commentary.`;
      const parsed = parseJson(
        await askModel(settings, prompt + reminder, maxTokens),
      );
      if (parsed) return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}

function sampleChunks(chunks: GraphChunk[], limit: number): GraphChunk[] {
  if (chunks.length <= limit) return chunks;
  const byDocument = new Map<string, GraphChunk[]>();
  for (const chunk of chunks) {
    const rows = byDocument.get(chunk.documentId) ?? [];
    rows.push(chunk);
    byDocument.set(chunk.documentId, rows);
  }
  const output: GraphChunk[] = [];
  const groups = [...byDocument.values()];
  for (let round = 0; output.length < limit; round++) {
    let added = false;
    for (const group of groups) {
      const index = Math.floor(
        (round * group.length) / Math.ceil(limit / groups.length),
      );
      if (group[index] && !output.includes(group[index])) {
        output.push(group[index]);
        added = true;
        if (output.length === limit) break;
      }
    }
    if (!added) break;
  }
  return output;
}

function readCategories(value: unknown): SchemaCategory[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = categoryName(record.name);
    const description = clean(record.description);
    if (!name || !description || name.split("_").length > 5) return [];
    return [{ name, description }];
  });
}

function mergeCategories(
  base: SchemaCategory[],
  extra: SchemaCategory[],
): SchemaCategory[] {
  const categories = new Map(base.map((item) => [item.name, item]));
  for (const item of extra)
    if (!categories.has(item.name)) categories.set(item.name, item);
  return [...categories.values()];
}

function parseJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const value = JSON.parse(cleaned);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function sameAssertion(
  left: ExtractedAssertion,
  right: ExtractedAssertion,
): boolean {
  if (normalize(left.subject) !== normalize(right.subject)) return false;
  if (normalize(left.object) !== normalize(right.object)) return false;
  const leftWords = new Set(
    categoryName(left.rawPredicate).split("_").filter(Boolean),
  );
  const rightWords = new Set(
    categoryName(right.rawPredicate).split("_").filter(Boolean),
  );
  if (!leftWords.size || !rightWords.size) return false;
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
  return overlap / Math.min(leftWords.size, rightWords.size) >= 0.5;
}

function assertionKey(assertion: ExtractedAssertion): string {
  return [
    normalize(assertion.subject),
    categoryName(assertion.rawPredicate),
    normalize(assertion.object),
    assertion.evidence,
  ].join("\u0000");
}

function firstPython(): string {
  const candidates = [
    resolve(process.cwd(), ".venv/bin/python"),
    "/opt/homebrew/Caskroom/miniforge/base/envs/Python-ML/bin/python",
    "/opt/homebrew/Caskroom/miniforge/base/envs/Python-DS/bin/python",
  ];
  return candidates.find(existsSync) ?? "python3";
}

function categoryName(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

function nullableText(value: unknown): string | null {
  const text = clean(value);
  return text || null;
}

function emptyResult(): ExtractionResult {
  return { entities: [], assertions: [] };
}

function hasUsableText(text: string): boolean {
  const words = text.match(/\p{L}[\p{L}\p{N}'’-]{2,}/gu) ?? [];
  return words.length >= 3 && words.join("").length >= 12;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
