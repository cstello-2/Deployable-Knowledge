// Knowledge-graph search uses the app's existing hybrid retriever as grounded seeds,
// then adds LightRAG neighborhoods and PathRAG relational traversal before reranking.

import { searchHybrid } from "$lib/server/rag/search/hybrid-search";
import type { SearchChunkType } from "$lib/server/rag/search/search-shared";
import { loadKnowledgeGraph } from "./graph-index";
import { lightRagSearch } from "./light-rag";
import { pathRagSearch } from "./path-rag";
import type {
  KnowledgeGraphMatch,
  KnowledgeGraphPath,
  KnowledgeGraphSearchResult,
  RelationType,
} from "./types";
import { unique } from "./utils";

export type KnowledgeGraphSearchOptions = {
  query: string;
  topK?: number;
  documentIds?: string[];
  chunkTypes?: SearchChunkType[];
  maxDepth?: number;
};

type ScoreAccumulator = {
  hybridScore: number;
  lightScore: number;
  pathScore: number;
  matchedEntities: string[];
  relations: RelationType[];
  pathCount: number;
};

export async function searchKnowledgeGraph(
  options: KnowledgeGraphSearchOptions,
): Promise<KnowledgeGraphSearchResult> {
  const query = options.query.trim();
  const topK = Math.max(0, Math.floor(options.topK ?? 5));
  if (!query || topK === 0) return { query, results: [], paths: [] };

  // The existing hybrid search supplies high-quality lexical/semantic starting chunks.
  const hybrid = await searchHybrid({
    query,
    topK: Math.max(topK * 2, 10),
    documentIds: options.documentIds,
    chunkTypes: options.chunkTypes,
  });
  const hybridSeeds = hybrid.results.map((match, index) => ({
    ...match,
    score: 1 / (index + 1),
  }));
  const index = await loadKnowledgeGraph(options.documentIds);
  const graph = index.graph;
  const seedChunkIds = hybridSeeds.map((match) => match.chunkId);
  const lightEvidence = lightRagSearch(query, graph, seedChunkIds);
  const paths = pathRagSearch(
    query,
    graph,
    seedChunkIds,
    Math.max(1, Math.min(4, options.maxDepth ?? 3)),
    Math.max(topK * 3, 12),
  );
  const scores = collectScores(hybridSeeds, lightEvidence, paths);

  const maxHybrid = maxScore([...scores.values()].map((score) => score.hybridScore));
  const maxLight = maxScore([...scores.values()].map((score) => score.lightScore));
  const maxPath = maxScore([...scores.values()].map((score) => score.pathScore));
  const allowedTypes = new Set(options.chunkTypes ?? []);
  const results: KnowledgeGraphMatch[] = [];

  for (const [chunkId, score] of scores) {
    const chunk = index.chunksById.get(chunkId);
    if (!chunk) continue;
    if (allowedTypes.size && !allowedTypes.has(chunk.chunkType)) continue;

    // Weighted fusion keeps hybrid retrieval dominant while allowing graph-only evidence
    // to surface when it participates in a strong neighborhood or relational path.
    const hybridPart = score.hybridScore / maxHybrid;
    const lightPart = score.lightScore / maxLight;
    const pathPart = score.pathScore / maxPath;
    const graphScore = lightPart * 0.6 + pathPart * 0.4;

    results.push({
      ...chunk,
      score:
        hybridPart * 0.9 +
        lightPart * 0.07 +
        pathPart * 0.03 +
        acronymDefinitionBoost(query, chunk.content),
      graphScore,
      hybridScore: score.hybridScore || undefined,
      matchedEntities: unique(score.matchedEntities),
      relations: unique(score.relations),
      pathCount: score.pathCount,
    });
  }

  results.sort((left, right) => right.score - left.score);
  return { query, results: results.slice(0, topK), paths };
}

function acronymDefinitionBoost(query: string, content: string): number {
  const match = query.match(/\b(?:what\s+does|define)\s+([A-Z][A-Z0-9/-]{1,12})\s+(?:stand\s+for|mean)\b/i);
  const acronym = match?.[1]?.toUpperCase();
  if (!acronym) return 0;

  const normalized = content.replace(/\s+/g, " ");
  const escaped = acronym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const definesAcronym =
    new RegExp(`\\b${escaped}\\b\\s*\\(`, "i").test(normalized) ||
    new RegExp(`\\b${escaped}\\b\\s+acronym\\b`, "i").test(normalized) ||
    new RegExp(`\\bacronym\\s+${escaped}\\b`, "i").test(normalized);

  return definesAcronym ? 0.2 : 0;
}

function collectScores(
  hybrid: Array<{ chunkId: string; score: number }>,
  light: Array<{
    chunkId: string;
    score: number;
    matchedEntities: string[];
    relations: RelationType[];
  }>,
  paths: KnowledgeGraphPath[],
): Map<string, ScoreAccumulator> {
  const scores = new Map<string, ScoreAccumulator>();

  for (const match of hybrid) {
    getScore(scores, match.chunkId).hybridScore = Math.max(0, match.score);
  }
  for (const evidence of light) {
    const score = getScore(scores, evidence.chunkId);
    score.lightScore += evidence.score;
    score.matchedEntities.push(...evidence.matchedEntities);
    score.relations.push(...evidence.relations);
  }
  for (const path of paths) {
    for (const chunkId of path.chunkIds) {
      const score = getScore(scores, chunkId);
      score.pathScore += path.score;
      score.pathCount += 1;
      score.relations.push(...path.edges.map((edge) => edge.relation));
      score.matchedEntities.push(
        ...path.nodes.filter((node) => node.kind === "entity").map((node) => node.label),
      );
    }
  }

  return scores;
}

function getScore(
  scores: Map<string, ScoreAccumulator>,
  chunkId: string,
): ScoreAccumulator {
  const existing = scores.get(chunkId);
  if (existing) return existing;

  const created: ScoreAccumulator = {
    hybridScore: 0,
    lightScore: 0,
    pathScore: 0,
    matchedEntities: [],
    relations: [],
    pathCount: 0,
  };
  scores.set(chunkId, created);
  return created;
}

function maxScore(values: number[]): number {
  return Math.max(1, ...values.filter(Number.isFinite));
}
