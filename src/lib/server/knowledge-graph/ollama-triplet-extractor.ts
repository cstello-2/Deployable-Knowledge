import { sanitizeEntityLabel } from "./utils";
import { extractWithTypeScript } from "./typescript-extractor";
import type { GlinerEntity, GlinerRelation } from "./gliner-extractor";

type TripletPayload = {
  entities?: Array<Record<string, unknown> | string>;
  relations?: Array<Record<string, unknown>>;
};

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env.KNOWLEDGE_GRAPH_TRIPLET_MODEL ?? process.env.OLLAMA_MODEL ?? "llama3.2:3b";
const REQUEST_TIMEOUT_MS = Number(process.env.KNOWLEDGE_GRAPH_TRIPLET_TIMEOUT_MS ?? 120_000);
const MAX_CHUNK_CHARS = Number(process.env.KNOWLEDGE_GRAPH_TRIPLET_MAX_CHARS ?? 1_800);
const MAX_ENTITIES = 24;
const MAX_RELATIONS = 32;

let ollamaDisabled = false;
let warnedAboutFallback = false;

export async function extractWithOllamaTriplets(
  text: string,
  labels: string[] = [],
  chunkId?: string,
): Promise<{ entities: GlinerEntity[]; relations: GlinerRelation[] }> {
  if (ollamaDisabled || !text.trim()) {
    return extractWithTypeScript(text, labels, chunkId);
  }

  try {
    const payload = await requestTriplets(text, labels);
    const parsed = parseTripletPayload(payload, chunkId);
    if (parsed.entities.length || parsed.relations.length) return parsed;

    return extractWithTypeScript(text, labels, chunkId);
  } catch (error) {
    ollamaDisabled = true;
    warnFallback(error);
    return extractWithTypeScript(text, labels, chunkId);
  }
}

async function requestTriplets(text: string, labels: string[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        stream: false,
        format: "json",
        options: {
          temperature: 0,
          top_k: 20,
          num_predict: 700,
        },
        messages: [
          {
            role: "system",
            content: [
              "You extract a source-grounded knowledge graph from document chunks.",
              "Return only valid JSON.",
              "Do not use a preset dictionary.",
              "Only create entities and relations supported by the chunk text.",
              "Prefer precise domain terms, acronyms, organizations, procedures, conditions, systems, people, places, dates, and document names.",
              "Relations must be short uppercase verb phrases such as INCLUDES, REQUIRES, DEFINES, USES, TREATS, ASSIGNED_TO, REFERENCES, HAS_STEP, LOCATED_IN, SUPERSEDES, RELATED_TO.",
            ].join(" "),
          },
          {
            role: "user",
            content: buildPrompt(text, labels),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama triplet extraction failed with HTTP ${response.status}`);
    }

    const data = await response.json() as { message?: { content?: unknown }; response?: unknown };
    const content = data.message?.content ?? data.response;
    if (typeof content !== "string") {
      throw new Error("Ollama returned no triplet JSON content");
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(text: string, labels: string[]): string {
  const chunk = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHUNK_CHARS);
  const labelHint = labels.length
    ? `Optional user/query focus labels: ${labels.join(", ")}. Use only if supported by the chunk.`
    : "No preset entity dictionary is provided; infer entities from the chunk itself.";

  return [
    labelHint,
    "",
    "Extract JSON in exactly this shape:",
    "{",
    '  "entities": [',
    '    { "label": "entity name", "kind": "protocol|condition|treatment|organization|person|location|system|technology|document|date|concept|acronym|unknown" }',
    "  ],",
    '  "relations": [',
    '    { "source": "entity label", "relation": "RELATION_NAME", "target": "entity label", "evidence": "short exact supporting phrase from chunk" }',
    "  ]",
    "}",
    "",
    `Limits: at most ${MAX_ENTITIES} entities and ${MAX_RELATIONS} relations.`,
    "Skip vague entities like 'information', 'section', 'document', 'page', or pure numbers unless they are named references.",
    "Every relation source and target must also appear as an entity label.",
    "",
    "Chunk:",
    chunk,
  ].join("\n");
}

function parseTripletPayload(
  payload: string,
  chunkId?: string,
): { entities: GlinerEntity[]; relations: GlinerRelation[] } {
  const parsed = parseJsonObject(payload);
  if (!parsed) return { entities: [], relations: [] };

  const body = parsed as TripletPayload;
  const entities = Array.isArray(body.entities)
    ? body.entities
        .map((item) => parseEntity(item, chunkId))
        .filter((entity): entity is GlinerEntity => Boolean(entity?.label))
        .slice(0, MAX_ENTITIES)
    : [];
  const entityLabels = new Set(entities.map((entity) => entity.label.toLowerCase()));
  const relations = Array.isArray(body.relations)
    ? body.relations
        .map(parseRelation)
        .filter((relation): relation is GlinerRelation =>
          Boolean(
            relation?.source &&
              relation.target &&
              entityLabels.has(relation.source.toLowerCase()) &&
              entityLabels.has(relation.target.toLowerCase()),
          ),
        )
        .slice(0, MAX_RELATIONS)
    : [];

  return {
    entities: dedupeEntities(entities),
    relations: dedupeRelations(relations),
  };
}

function parseJsonObject(payload: string): unknown | null {
  try {
    return JSON.parse(payload);
  } catch {
    const match = payload.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function parseEntity(item: Record<string, unknown> | string, chunkId?: string): GlinerEntity | null {
  if (typeof item === "string") {
    const label = sanitizeEntityLabel(item);
    return label ? { label, kind: "unknown", chunkIds: chunkId ? [chunkId] : undefined } : null;
  }

  const label = sanitizeEntityLabel(
    String(item.label ?? item.name ?? item.entity ?? item.text ?? item.value ?? ""),
  );
  if (!label) return null;

  return {
    label,
    kind: normalizeKind(String(item.kind ?? item.type ?? item.entityType ?? "unknown")),
    chunkIds: chunkId ? [chunkId] : undefined,
  };
}

function parseRelation(item: Record<string, unknown>): GlinerRelation | null {
  const source = sanitizeEntityLabel(String(item.source ?? item.head ?? item.subject ?? ""));
  const target = sanitizeEntityLabel(String(item.target ?? item.tail ?? item.object ?? ""));
  const relation = normalizeRelation(String(item.relation ?? item.predicate ?? item.type ?? "RELATED_TO"));
  const evidence = String(item.evidence ?? item.sentence ?? "").replace(/\s+/g, " ").trim();

  if (!source || !target || source.toLowerCase() === target.toLowerCase()) return null;
  return { source, target, relation, evidence };
}

function normalizeKind(kind: string): string {
  return kind.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function normalizeRelation(relation: string): string {
  return relation.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "RELATED_TO";
}

function dedupeEntities(entities: GlinerEntity[]): GlinerEntity[] {
  const byLabel = new Map<string, GlinerEntity>();
  for (const entity of entities) {
    const key = entity.label.toLowerCase();
    const existing = byLabel.get(key);
    if (!existing) {
      byLabel.set(key, entity);
      continue;
    }
    if (existing.kind === "unknown" && entity.kind !== "unknown") existing.kind = entity.kind;
    existing.chunkIds = [...new Set([...(existing.chunkIds ?? []), ...(entity.chunkIds ?? [])])];
  }
  return [...byLabel.values()];
}

function dedupeRelations(relations: GlinerRelation[]): GlinerRelation[] {
  const seen = new Set<string>();
  const output: GlinerRelation[] = [];
  for (const relation of relations) {
    const key = `${relation.source.toLowerCase()}\u0000${relation.relation}\u0000${relation.target.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(relation);
  }
  return output;
}

function warnFallback(error: unknown): void {
  if (warnedAboutFallback) return;
  warnedAboutFallback = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Ollama triplet extractor unavailable; falling back to TypeScript extractor. ${message}`);
}
