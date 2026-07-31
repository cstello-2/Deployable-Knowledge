import { GraphStore } from "./graph-store";
import type { GraphNode } from "./types";
import { graphId, isNoisyEntityLabel, tokenize } from "./utils";

export type GraphSeedSource = "hybrid" | "entity-exact" | "entity-fuzzy";

export type GraphSeedCandidate = {
  nodeId: string;
  kind: "chunk" | "entity";
  label: string;
  chunkId?: string;
  score: number;
  sources: GraphSeedSource[];
  sourceScores: Partial<Record<GraphSeedSource, number>>;
  matchedText?: string;
};

export type HybridSeedMatch = {
  chunkId: string;
  score: number;
};

export type GraphSeedSelectionOptions = {
  query: string;
  graph: GraphStore;
  hybridResults: readonly HybridSeedMatch[];
  hybridLimit?: number;
  exactLimit?: number;
  fuzzyLimit?: number;
  totalLimit?: number;
};

const DEFAULT_HYBRID_LIMIT = 12;
const DEFAULT_EXACT_LIMIT = 8;
const DEFAULT_FUZZY_LIMIT = 5;
const DEFAULT_TOTAL_LIMIT = 20;
const FUZZY_THRESHOLD = 0.84;
const FUZZY_SCORE_CAP = 0.75;
const MIN_FUZZY_LABEL_LENGTH = 5;

const SOURCE_ORDER: Record<GraphSeedSource, number> = {
  "entity-exact": 0,
  hybrid: 1,
  "entity-fuzzy": 2,
};

/**
 * Convert the hybrid retriever's unbounded scores and ordering into stable 0..1
 * seed confidence. Score carries 70% of the signal and rank carries 30%.
 */
export function selectHybridSeedCandidates(
  graph: GraphStore,
  matches: readonly HybridSeedMatch[],
  limit = DEFAULT_HYBRID_LIMIT,
): GraphSeedCandidate[] {
  const cappedLimit = nonNegativeInteger(limit);
  if (cappedLimit === 0) return [];

  const byNodeId = new Map<
    string,
    { node: GraphNode; chunkId: string; rawScore: number; rank: number }
  >();

  for (const [index, match] of matches.entries()) {
    const nodeId = graphId("chunk", match.chunkId);
    const node = graph.getNode(nodeId);
    if (node?.kind !== "chunk") continue;

    const rawScore = Number.isFinite(match.score) ? match.score : Number.NEGATIVE_INFINITY;
    const existing = byNodeId.get(nodeId);
    if (!existing) {
      byNodeId.set(nodeId, {
        node,
        chunkId: match.chunkId,
        rawScore,
        rank: index,
      });
      continue;
    }

    existing.rank = Math.min(existing.rank, index);
    existing.rawScore = Math.max(existing.rawScore, rawScore);
  }

  const ranked = [...byNodeId.values()].sort(
    (left, right) => left.rank - right.rank || left.node.id.localeCompare(right.node.id),
  );
  if (!ranked.length) return [];

  const finiteScores = ranked
    .map((candidate) => candidate.rawScore)
    .filter(Number.isFinite);
  const minimumScore = finiteScores.length ? Math.min(...finiteScores) : 0;
  const maximumScore = finiteScores.length ? Math.max(...finiteScores) : 0;
  const scoreRange = maximumScore - minimumScore;

  return ranked
    .map((candidate, index) => {
      const rankScore = ranked.length === 1 ? 1 : 1 - index / (ranked.length - 1);
      const scoreValue = Number.isFinite(candidate.rawScore)
        ? candidate.rawScore
        : minimumScore;
      // When every reranker score is tied, rank is the only useful discriminator.
      const normalizedScore = scoreRange > Number.EPSILON
        ? (scoreValue - minimumScore) / scoreRange
        : rankScore;
      const score = clamp01(normalizedScore * 0.7 + rankScore * 0.3);

      return createCandidate(
        candidate.node,
        "hybrid",
        score,
        candidate.chunkId,
      );
    })
    .sort(compareCandidates)
    .slice(0, cappedLimit);
}

/** Select entities whose entire normalized label occurs in the query. */
export function selectExactEntitySeedCandidates(
  query: string,
  graph: GraphStore,
  limit = DEFAULT_EXACT_LIMIT,
): GraphSeedCandidate[] {
  const cappedLimit = nonNegativeInteger(limit);
  if (cappedLimit === 0) return [];

  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  const candidates: GraphSeedCandidate[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== "entity") continue;
    if (isNoisyEntityLabel(node.label, node.entityKind)) continue;
    const labelTokens = tokenize(node.label);
    if (!labelTokens.length || !containsTokenSequence(queryTokens, labelTokens)) continue;

    const equalsQuery = arraysEqual(queryTokens, labelTokens);
    candidates.push(
      createCandidate(
        node,
        "entity-exact",
        equalsQuery ? 1 : 0.95,
        undefined,
        node.label,
      ),
    );
  }

  return candidates
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (Math.abs(scoreDifference) > Number.EPSILON) return scoreDifference;
      const tokenDifference = tokenize(right.label).length - tokenize(left.label).length;
      return tokenDifference || right.label.length - left.label.length ||
        left.nodeId.localeCompare(right.nodeId);
    })
    .slice(0, cappedLimit);
}

/**
 * Select typo-tolerant entity labels by comparing each label with a same-token-count
 * query window. Short labels are excluded because one edit is too ambiguous.
 */
export function selectFuzzyEntitySeedCandidates(
  query: string,
  graph: GraphStore,
  limit = DEFAULT_FUZZY_LIMIT,
  threshold = FUZZY_THRESHOLD,
): GraphSeedCandidate[] {
  const cappedLimit = nonNegativeInteger(limit);
  if (cappedLimit === 0) return [];

  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  const candidates: GraphSeedCandidate[] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== "entity") continue;
    if (isNoisyEntityLabel(node.label, node.entityKind)) continue;

    const labelTokens = tokenize(node.label);
    const normalizedLabel = labelTokens.join(" ");
    if (
      normalizedLabel.length < MIN_FUZZY_LABEL_LENGTH ||
      !labelTokens.length ||
      containsTokenSequence(queryTokens, labelTokens)
    ) {
      continue;
    }

    const match = bestFuzzyWindow(normalizedLabel, labelTokens.length, queryTokens);
    if (!match || match.similarity < threshold) continue;

    candidates.push(
      createCandidate(
        node,
        "entity-fuzzy",
        Math.min(FUZZY_SCORE_CAP, match.similarity * FUZZY_SCORE_CAP),
        undefined,
        match.text,
      ),
    );
  }

  return candidates.sort(compareCandidates).slice(0, cappedLimit);
}

/** Merge source candidates by canonical graph node ID, then rank deterministically. */
export function mergeGraphSeedCandidates(
  candidateGroups: ReadonlyArray<readonly GraphSeedCandidate[]>,
  limit = DEFAULT_TOTAL_LIMIT,
): GraphSeedCandidate[] {
  const cappedLimit = nonNegativeInteger(limit);
  if (cappedLimit === 0) return [];

  const merged = new Map<string, GraphSeedCandidate>();
  for (const candidate of candidateGroups.flat()) {
    const existing = merged.get(candidate.nodeId);
    if (!existing) {
      merged.set(candidate.nodeId, {
        ...candidate,
        sources: sortSources(candidate.sources),
        sourceScores: { ...candidate.sourceScores },
      });
      continue;
    }

    for (const source of candidate.sources) {
      const incomingScore = candidate.sourceScores[source] ?? candidate.score;
      existing.sourceScores[source] = Math.max(
        existing.sourceScores[source] ?? 0,
        incomingScore,
      );
    }
    existing.sources = sortSources([...existing.sources, ...candidate.sources]);
    existing.score = Math.max(existing.score, candidate.score);
    if (!existing.matchedText && candidate.matchedText) {
      existing.matchedText = candidate.matchedText;
    }
  }

  return [...merged.values()].sort(compareCandidates).slice(0, cappedLimit);
}

/** Run each independent seed source and produce one capped, deduplicated list. */
export function selectGraphSeedCandidates({
  query,
  graph,
  hybridResults,
  hybridLimit = DEFAULT_HYBRID_LIMIT,
  exactLimit = DEFAULT_EXACT_LIMIT,
  fuzzyLimit = DEFAULT_FUZZY_LIMIT,
  totalLimit = DEFAULT_TOTAL_LIMIT,
}: GraphSeedSelectionOptions): GraphSeedCandidate[] {
  const hybrid = selectHybridSeedCandidates(graph, hybridResults, hybridLimit);
  const exact = selectExactEntitySeedCandidates(query, graph, exactLimit);
  const fuzzy = selectFuzzyEntitySeedCandidates(query, graph, fuzzyLimit);
  return mergeGraphSeedCandidates([hybrid, exact, fuzzy], totalLimit);
}

function createCandidate(
  node: GraphNode,
  source: GraphSeedSource,
  score: number,
  chunkId?: string,
  matchedText?: string,
): GraphSeedCandidate {
  return {
    nodeId: node.id,
    kind: node.kind === "chunk" ? "chunk" : "entity",
    label: node.label,
    chunkId: chunkId ?? node.chunkId,
    score,
    sources: [source],
    sourceScores: { [source]: score },
    matchedText,
  };
}

function compareCandidates(left: GraphSeedCandidate, right: GraphSeedCandidate): number {
  const scoreDifference = right.score - left.score;
  if (Math.abs(scoreDifference) > Number.EPSILON) return scoreDifference;

  const leftPriority = Math.min(...left.sources.map((source) => SOURCE_ORDER[source]));
  const rightPriority = Math.min(...right.sources.map((source) => SOURCE_ORDER[source]));
  return leftPriority - rightPriority || left.nodeId.localeCompare(right.nodeId);
}

function sortSources(sources: readonly GraphSeedSource[]): GraphSeedSource[] {
  return [...new Set(sources)].sort(
    (left, right) => SOURCE_ORDER[left] - SOURCE_ORDER[right],
  );
}

function containsTokenSequence(tokens: readonly string[], sequence: readonly string[]): boolean {
  if (!sequence.length || sequence.length > tokens.length) return false;

  for (let start = 0; start <= tokens.length - sequence.length; start += 1) {
    if (sequence.every((token, offset) => token === tokens[start + offset])) return true;
  }
  return false;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function bestFuzzyWindow(
  normalizedLabel: string,
  tokenCount: number,
  queryTokens: readonly string[],
): { text: string; similarity: number } | undefined {
  if (tokenCount > queryTokens.length) return undefined;

  let best: { text: string; similarity: number } | undefined;
  for (let start = 0; start <= queryTokens.length - tokenCount; start += 1) {
    const text = queryTokens.slice(start, start + tokenCount).join(" ");
    const similarity = normalizedEditSimilarity(normalizedLabel, text);
    if (
      !best ||
      similarity > best.similarity ||
      (similarity === best.similarity && text.localeCompare(best.text) < 0)
    ) {
      best = { text, similarity };
    }
  }
  return best;
}

function normalizedEditSimilarity(left: string, right: string): number {
  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 1;
  return 1 - levenshteinDistance(left, right) / longest;
}

function levenshteinDistance(left: string, right: string): number {
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function nonNegativeInteger(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
