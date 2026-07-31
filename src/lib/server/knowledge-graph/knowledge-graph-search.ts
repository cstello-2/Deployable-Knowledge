// Knowledge-graph search combines hybrid chunks with exact and fuzzy entity-label seeds,
// then adds LightRAG neighborhoods and PathRAG relational traversal before reranking.

import { searchHybrid } from "$lib/server/rag/search/hybrid-search";
import type { SearchChunkType } from "$lib/server/rag/search/search-shared";
import {
  augmentGraphWithQueryLabels,
  ensureKnowledgeGraph,
} from "./graph-index";
import { extractQueryEntities } from "./gliner-extractor";
import { lightRagSearch } from "./light-rag";
import { pathRagSearch } from "./path-rag";
import { selectGraphSeedCandidates } from "./seed-selection";
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

  // Build a missing or stale selected-document graph automatically. A current graph
  // is reused, and concurrent answer/visualization requests share the same build.
  // Hybrid chunks remain strong grounded seeds; label matching adds graph-native recall.
  const index = await ensureKnowledgeGraph(options.documentIds);
  const hybrid = await searchHybrid({
    query,
    topK: Math.max(topK * 3, 15),
    documentIds: options.documentIds,
    chunkTypes: options.chunkTypes,
  });
  const hybridSeeds = hybrid.results.map((match, index) => ({
    ...match,
    score: 1 / (index + 1),
  }));
  const queryEntities = await extractQueryEntities(query);
  const queryLabels = unique(queryEntities.map((entity) => entity.label));
  const graph = await augmentGraphWithQueryLabels(
    index.graph,
    index.chunksById,
    queryLabels,
    unique(hybrid.results.map((match) => match.chunkId)),
  );
  const seeds = selectGraphSeedCandidates({
    query,
    graph,
    hybridResults: hybridSeeds,
  });
  const lightEvidence = lightRagSearch(graph, seeds);
  const paths = pathRagSearch(
    query,
    graph,
    seeds,
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

    // Weighted fusion now lets graph structure lead while hybrid remains a grounding
    // signal. This keeps KG search meaningfully different from plain hybrid search.
    const hybridPart = score.hybridScore / maxHybrid;
    const lightPart = score.lightScore / maxLight;
    const pathPart = score.pathScore / maxPath;
    const graphScore = lightPart * 0.6 + pathPart * 0.4;

    results.push({
      ...chunk,
      score: clamp01(
        hybridPart * 0.45 +
        lightPart * 0.28 +
        pathPart * 0.27 +
        acronymDefinitionBoost(query, chunk.content),
      ),
      graphScore: clamp01(graphScore),
      hybridScore: score.hybridScore || undefined,
      matchedEntities: unique(score.matchedEntities),
      relations: unique(score.relations),
      pathCount: score.pathCount,
    });
  }

  results.sort((left, right) => right.score - left.score);
  return { query, results: results.slice(0, topK), paths };
}

export function acronymDefinitionBoost(query: string, content: string): number {
  const match = query.match(/\b(?:what\s+does|define)\s+([A-Z][A-Z0-9/-]{1,12})\s+(?:stand\s+for|mean)\b/i);
  const acronym = match?.[1]?.toUpperCase();
  if (!acronym) return 0;

  const normalized = content.replace(/\s+/g, " ");
  const escaped = acronym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const definesAcronym =
    new RegExp(`\\b${escaped}\\b\\s*\\(`).test(normalized) ||
    new RegExp(`\\b${escaped}\\b\\s+(?:stands\\s+for|means)\\b`, "i").test(normalized) ||
    new RegExp(`\\b${escaped}\\b\\s+acronym\\b`, "i").test(normalized) ||
    new RegExp(`\\bacronym\\s+${escaped}\\b`, "i").test(normalized);

  // Definition questions need the defining graph evidence to outrank incidental
  // lexical matches such as calendar dates returned by the hybrid seed search.
  return definesAcronym ? 1 : 0;
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
