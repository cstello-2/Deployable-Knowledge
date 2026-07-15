import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeLabel, sanitizeEntityLabel, unique } from "./utils";

export type GlinerEntity = {
  label: string;
  kind: string;
  chunkIds?: string[];
};

export type GlinerRelation = {
  source: string;
  target: string;
  relation: string;
  evidence?: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = resolve(__dirname, "gliner-extractor.py");

function getPythonExecutable(): string {
  if (process.env.PYTHON) return process.env.PYTHON;

  const workspaceRoot = resolve(__dirname, "..", "..", "..", "..");
  const venvPython = resolve(workspaceRoot, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  if (existsSync(venvPython)) {
    return venvPython;
  }

  return "python";
}

function runPythonInference(text: string, labels: string[] = []): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const python = getPythonExecutable();
    const child = spawn(python, [PYTHON_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      rejectPromise(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(stderr.trim() || `Python extractor exited with code ${code}`));
        return;
      }
      resolvePromise(stdout.trim());
    });

    child.stdin.write(JSON.stringify({ text, labels }));
    child.stdin.end();
  });
}

export const BASE_ENTITY_LABELS = [
  "person",
  "organization",
  "location",
  "condition",
  "treatment",
  "protocol",
  "technology",
  "system",
  "concept",
  "event",
  "artifact",
  "date",
  "quantity",
  "unknown",
];

export function resolveEntityLabels(labels: string[] = []): string[] {
  const normalized = unique(labels.map((label) => label.trim()).filter(Boolean));
  return normalized.length ? normalized : BASE_ENTITY_LABELS;
}

function safeText(text: unknown): string {
  return String(text ?? "").trim();
}

function parseInferencePayload(payload: string): { entities: GlinerEntity[]; relations: GlinerRelation[] } {
  const normalized = payload.trim();
  if (!normalized) {
    return { entities: [], relations: [] };
  }

  try {
    const parsed = JSON.parse(normalized);
    if (parsed && typeof parsed === "object") {
      const entities = Array.isArray(parsed.entities)
        ? parsed.entities.map((item: unknown) => {
            if (typeof item === "string") {
              return { label: sanitizeEntityLabel(item), kind: "unknown" };
            }
            if (item && typeof item === "object") {
              const record = item as Record<string, unknown>;
              return {
                label: sanitizeEntityLabel(String(record.text ?? record.entity ?? record.name ?? record.value ?? record.label ?? "")),
                kind: safeText(record.kind ?? record.type ?? record.entity_type ?? record.entityType ?? "unknown"),
                chunkIds: Array.isArray(record.chunkIds)
                  ? unique(String(record.chunkIds[0] ?? "").split(",").filter(Boolean))
                  : undefined,
              };
            }
            return { label: "", kind: "unknown" };
          })
        : [];
      const relations = Array.isArray(parsed.relations)
        ? parsed.relations.map((item: unknown) => {
            if (item && typeof item === "object") {
              const record = item as Record<string, unknown>;
              return {
                source: sanitizeEntityLabel(String(record.source ?? record.head ?? record.arg1 ?? "")),
                target: sanitizeEntityLabel(String(record.target ?? record.tail ?? record.arg2 ?? "")),
                relation: safeText(record.relation ?? record.type ?? record.label ?? "related_to"),
                evidence: safeText(record.evidence ?? record.sentence ?? ""),
              };
            }
            return { source: "", target: "", relation: "related_to", evidence: "" };
          })
        : [];

      return {
        entities: dedupeEntities(entities.filter((entity: GlinerEntity) => entity.label)),
        relations: dedupeRelations(relations.filter((relation: GlinerRelation) => relation.source && relation.target)),
      };
    }
  } catch {
    // fall through and use the text-based helpers below
  }

  return {
    entities: parseEntities(normalized),
    relations: parseRelations(normalized),
  };
}

async function runGlinerInference(
  text: string,
  labels: string[] = [],
  chunkId?: string,
): Promise<{ entities: GlinerEntity[]; relations: GlinerRelation[] }> {
  const payload = await runPythonInference(text, labels);
  const result = parseInferencePayload(payload);
  const entities = result.entities.map((entity) => ({
    ...entity,
    chunkIds: entity.chunkIds?.length ? entity.chunkIds : chunkId ? [chunkId] : undefined,
  }));
  return { entities, relations: result.relations };
}

function parseEntities(text: string): GlinerEntity[] {
  const normalized = text.replace(/\r/g, "").trim();
  const entities: GlinerEntity[] = [];

  const jsonMatch = normalized.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const items = Array.isArray(parsed.entities) ? parsed.entities : parsed;
      for (const item of items) {
        if (typeof item === "string") {
          const label = sanitizeEntityLabel(item);
          if (label) entities.push({ label, kind: "unknown" });
        } else if (item && typeof item === "object") {
          const label = sanitizeEntityLabel(item.label ?? item.name ?? "");
          const kind = safeText(item.kind ?? item.type ?? "unknown");
          if (label) entities.push({ label, kind });
        }
      }
      return dedupeEntities(entities);
    } catch {
      // fall through to parse
    }
  }

  for (const line of normalized.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const jsonObjMatch = trimmed.match(/\{[^\}]+\}/);
    if (jsonObjMatch) {
      try {
        const parsed = JSON.parse(jsonObjMatch[0]);
        if (typeof parsed.label === "string") {
          entities.push({ label: sanitizeEntityLabel(parsed.label), kind: safeText(parsed.kind ?? "unknown") });
          continue;
        }
      } catch {
        // ignore
      }
    }

    const listMatch = trimmed.match(/^[-*\s]*\[?([^\]]+)\]?\s*(?:\(|-|:)?\s*(.*)$/);
    if (listMatch) {
      const label = sanitizeEntityLabel(listMatch[1]);
      const remainder = listMatch[2].trim();
      const kindMatch = remainder.match(/^(protocol|treatment|condition|organization|technology|system|concept|person|location|event|artifact|date|quantity|unknown)/i);
      entities.push({ label, kind: kindMatch?.[1].toLowerCase() ?? "unknown" });
      continue;
    }

    const commaSplit = trimmed.split(/\s*,\s*/);
    if (commaSplit.length > 1) {
      for (const part of commaSplit) {
        const label = sanitizeEntityLabel(part);
        if (label) entities.push({ label, kind: "unknown" });
      }
      continue;
    }
  }

  return dedupeEntities(entities);
}

function dedupeEntities(entities: GlinerEntity[]): GlinerEntity[] {
  const byLower = new Map<string, GlinerEntity>();
  for (const entity of entities) {
    const key = entity.label.toLowerCase();
    const existing = byLower.get(key);
    if (!existing) {
      byLower.set(key, entity);
      continue;
    }

    if (existing.kind === "unknown" && entity.kind !== "unknown") {
      existing.kind = entity.kind;
    }

    const mergedChunkIds = unique([...(existing.chunkIds ?? []), ...(entity.chunkIds ?? [])]);
    existing.chunkIds = mergedChunkIds.length ? mergedChunkIds : undefined;
  }
  return [...byLower.values()];
}

function parseRelations(text: string): GlinerRelation[] {
  const normalized = text.replace(/\r/g, "").trim();
  const relations: GlinerRelation[] = [];

  const jsonMatch = normalized.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const items = Array.isArray(parsed.relations) ? parsed.relations : parsed;
      for (const item of items) {
        if (item && typeof item === "object") {
          const source = sanitizeEntityLabel(item.source ?? item.head ?? item.arg1 ?? "");
          const target = sanitizeEntityLabel(item.target ?? item.tail ?? item.arg2 ?? "");
          const relation = safeText(item.relation ?? item.type ?? item.label ?? "related_to");
          const evidence = safeText(item.evidence ?? item.sentence ?? "");
          if (source && target) relations.push({ source, target, relation, evidence });
        }
      }
      return dedupeRelations(relations);
    } catch {
      // fall through
    }
  }

  for (const line of normalized.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const pairMatch = trimmed.match(/^(.+?)\s*(?:\|>|->|-->|→|-)\s*(.+?)\s*[:\-]\s*(.+)$/);
    if (pairMatch) {
      relations.push({
        source: sanitizeEntityLabel(pairMatch[1]),
        target: sanitizeEntityLabel(pairMatch[2]),
        relation: normalizeLabel(pairMatch[3]),
      });
      continue;
    }

    const slashMatch = trimmed.match(/^(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/);
    if (slashMatch) {
      relations.push({
        source: sanitizeEntityLabel(slashMatch[1]),
        relation: normalizeLabel(slashMatch[2]),
        target: sanitizeEntityLabel(slashMatch[3]),
      });
      continue;
    }
  }

  return dedupeRelations(relations);
}

function dedupeRelations(relations: GlinerRelation[]): GlinerRelation[] {
  const seen = new Set<string>();
  const output: GlinerRelation[] = [];

  for (const relation of relations) {
    const key = `${relation.source.toLowerCase()}\u0000${relation.relation.toLowerCase()}\u0000${relation.target.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      output.push(relation);
    }
  }

  return output;
}

export async function extractQueryEntities(query: string): Promise<GlinerEntity[]> {
  if (!query.trim()) return [];
  const result = await runGlinerInference(query, BASE_ENTITY_LABELS);
  return result.entities;
}

export async function extractChunkEntitiesAndRelations(
  chunk: string,
  labels: string[] = [],
  chunkId?: string,
): Promise<{ entities: GlinerEntity[]; relations: GlinerRelation[] }> {
  if (!chunk.trim()) return { entities: [], relations: [] };
  return runGlinerInference(chunk, resolveEntityLabels(labels), chunkId);
}

export { parseEntities, parseRelations, parseInferencePayload };
