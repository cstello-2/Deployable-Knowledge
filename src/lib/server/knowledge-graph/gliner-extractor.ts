import { extractWithOllamaTriplets } from "./ollama-triplet-extractor";
import { extractWithTypeScript } from "./typescript-extractor";
import { unique } from "./utils";

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

type Extractor = "ollama" | "typescript";

function configuredExtractor(): Extractor {
  const value = (process.env.KNOWLEDGE_GRAPH_EXTRACTOR ?? "typescript")
    .trim()
    .toLowerCase();
  return value === "ollama" ? "ollama" : "typescript";
}

export function resolveEntityLabels(labels: string[] = []): string[] {
  const normalized = unique(labels.map((label) => label.trim()).filter(Boolean));
  return normalized.length ? normalized : BASE_ENTITY_LABELS;
}

async function runGlinerInference(
  text: string,
  labels: string[] = [],
  chunkId?: string,
): Promise<{ entities: GlinerEntity[]; relations: GlinerRelation[] }> {
  if (configuredExtractor() === "ollama") {
    return extractWithOllamaTriplets(text, labels, chunkId);
  }
  return extractWithTypeScript(text, labels, chunkId);
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
