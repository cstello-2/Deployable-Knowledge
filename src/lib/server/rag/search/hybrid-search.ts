// Hybrid search combines semantic and BM25 candidates with one shared relevance score.

import {
  searchSemantic,
  type SemanticSearchMatch,
} from "./semantic-search";
import { searchBm25, type Bm25SearchMatch } from "./bm25-search";
import { scoreCandidates } from "./crossRerank";
import {
  type RelevanceSearchMatch,
  type ScoredSearchMatch,
  type SearchOptionsBase,
  type SearchResult,
} from "./search-shared";

type SearchMethodResults = {
  query: string;
  semantic: RelevanceSearchMatch[];
  bm25: RelevanceSearchMatch[];
  hybrid: RelevanceSearchMatch[];
};

function toRelevanceMatch(
  match: ScoredSearchMatch,
  relevanceScore: number,
): RelevanceSearchMatch {
  const { score: _score, ...chunk } = match;
  return { ...chunk, relevanceScore };
}

export async function withRelevanceScores(
  query: string,
  semantic: SemanticSearchMatch[] = [],
  bm25: Bm25SearchMatch[] = [],
) {
  const scoredCandidates = await scoreCandidates(
    query,
    [...semantic, ...bm25].map((match) => ({
      chunkId: match.chunkId,
      content: match.content,
    })),
  );
  const scores = new Map(
    scoredCandidates.map((candidate) => [
      candidate.chunkId,
      candidate.relevanceScore,
    ]),
  );

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
  options: SearchOptionsBase,
): Promise<SearchMethodResults> {
  const query = options.query.trim();
  const topK = Math.max(0, Math.floor(options.topK ?? 10));

  if (!query || topK === 0) {
    return { query, semantic: [], bm25: [], hybrid: [] };
  }

  const sharedOptions = {
    ...options,
    query,
    topK: topK * 2,
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
  options: SearchOptionsBase,
): Promise<SearchResult<RelevanceSearchMatch>> {
  const search = await searchAllMethods(options);
  return {
    query: search.query,
    results: search.hybrid,
  };
}
