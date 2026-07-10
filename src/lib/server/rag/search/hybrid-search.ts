// Hybrid search combines semantic and BM25 candidates with one shared relevance score.

import {
  searchSemantic,
  type SemanticSearchMatch,
} from "./semantic-search";
import { searchBm25, type Bm25SearchMatch } from "./bm25-search";
import { reRankData, type Document } from "./crossRerank";
import {
  type RelevanceSearchMatch,
  type ScoredSearchMatch,
  type SearchOptionsBase,
  type SearchResult,
} from "./search-shared";

export type HybridSearchOptions = SearchOptionsBase;
export type HybridSearchMatch = RelevanceSearchMatch;
export type HybridSearchResult = SearchResult<HybridSearchMatch>;

export type SearchMethodResults = {
  query: string;
  semantic: RelevanceSearchMatch[];
  bm25: RelevanceSearchMatch[];
  hybrid: HybridSearchMatch[];
};

const RRF_K = 60;

function toRerankDocument(match: ScoredSearchMatch): Document {
  return {
    segmentID: match.chunkId,
    source: match.sourcePath,
    page: match.pageIndex,
    text: match.content,
  };
}

function toRelevanceMatch(
  match: ScoredSearchMatch,
  relevanceScore: number,
): RelevanceSearchMatch {
  const { score: _score, ...chunk } = match;
  return { ...chunk, relevanceScore };
}

function fallbackRelevanceScores(
  semantic: SemanticSearchMatch[],
  bm25: Bm25SearchMatch[],
): Map<string, number> {
  const semanticRanks = new Map(
    semantic.map((match, index) => [match.chunkId, index + 1]),
  );
  const bm25Ranks = new Map(
    bm25.map((match, index) => [match.chunkId, index + 1]),
  );
  const methodCount = Number(semantic.length > 0) + Number(bm25.length > 0);
  const maxScore = methodCount / (RRF_K + 1);
  const chunkIds = new Set([...semanticRanks.keys(), ...bm25Ranks.keys()]);
  const scores = new Map<string, number>();

  for (const chunkId of chunkIds) {
    const semanticRank = semanticRanks.get(chunkId);
    const bm25Rank = bm25Ranks.get(chunkId);
    const score =
      (semanticRank ? 1 / (RRF_K + semanticRank) : 0) +
      (bm25Rank ? 1 / (RRF_K + bm25Rank) : 0);
    scores.set(chunkId, maxScore ? score / maxScore : 0);
  }

  return scores;
}

export async function withRelevanceScores(
  query: string,
  semantic: SemanticSearchMatch[] = [],
  bm25: Bm25SearchMatch[] = [],
) {
  let scores: Map<string, number>;

  try {
    const reranked = await reRankData(
      query,
      bm25.map(toRerankDocument),
      semantic.map(toRerankDocument),
    );
    scores = new Map(
      reranked.map((result) => [
        String(result.segmentID),
        result.relevanceScore,
      ]),
    );
  } catch (error) {
    console.error("Cross reranker failed; using rank-based relevance:", error);
    scores = fallbackRelevanceScores(semantic, bm25);
  }

  return {
    semantic: semantic.map((match) =>
      toRelevanceMatch(match, scores.get(match.chunkId) ?? 0),
    ),
    bm25: bm25.map((match) =>
      toRelevanceMatch(match, scores.get(match.chunkId) ?? 0),
    ),
  };
}

export async function searchAllMethods(
  options: HybridSearchOptions,
): Promise<SearchMethodResults> {
  const query = options.query.trim();
  const topK = Math.max(0, Math.floor(options.topK ?? 10));

  if (!query || topK === 0) {
    return { query, semantic: [], bm25: [], hybrid: [] };
  }

  const candidateTopK = topK * 2;
  const sharedOptions = {
    ...options,
    query,
    topK: candidateTopK,
  };
  const [semanticSearch, bm25Search] = await Promise.all([
    searchSemantic(sharedOptions),
    searchBm25(sharedOptions),
  ]);
  const scored = await withRelevanceScores(
    query,
    semanticSearch.results,
    bm25Search.results,
  );
  const byChunkId = new Map<string, RelevanceSearchMatch>();

  for (const match of [...scored.semantic, ...scored.bm25]) {
    if (!byChunkId.has(match.chunkId)) {
      byChunkId.set(match.chunkId, match);
    }
  }

  const hybrid = [...byChunkId.values()]
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, topK);

  return {
    query,
    semantic: scored.semantic.slice(0, topK),
    bm25: scored.bm25.slice(0, topK),
    hybrid,
  };
}

export async function searchHybrid(
  options: HybridSearchOptions,
): Promise<HybridSearchResult> {
  const search = await searchAllMethods(options);
  return {
    query: search.query,
    results: search.hybrid,
  };
}
