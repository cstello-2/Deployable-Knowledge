import {
  searchSemantic,
  type SemanticSearchChunkType,
  type SemanticSearchMatch,
} from "./semantic-search";
import { searchBm25, type Bm25SearchMatch } from "./bm25-search";
import {
  weightedReciprocalRankRerank,
  type Document,
  type RerankedDocument,
} from "./mathRerank";

export type HybridSearchOptions = {
  query: string;
  topK?: number;
  documentIds?: string[];
  chunkTypes?: SemanticSearchChunkType[];
};

export type HybridSearchMatch = {
  chunkId: string;
  documentId: string;
  sourcePath: string;
  sourceTitle: string;
  pageIndex: number;
  chunkIndex: number;
  chunkType: SemanticSearchChunkType;
  content: string;
  score: number;
  semanticRank?: number;
  bm25Rank?: number;
  semanticScore?: number;
  bm25Score?: number;
  rerankSemanticScore: number;
  rerankBm25Score: number;
};

export type HybridSearchResult = {
  query: string;
  results: HybridSearchMatch[];
};

// Convert each search result into the common shape expected by the rank fusion helper.
function toRerankDocument(
  match: SemanticSearchMatch | Bm25SearchMatch,
  scoreField: "semanticScore" | "bm25Score",
): Document {
  return {
    segmentID: match.chunkId,
    source: match.sourcePath,
    page: match.pageIndex,
    text: match.content,
    score: match.score,
    [scoreField]: match.score,
    match,
  };
}

// The reranker keeps the original match on the document so we can return stored chunk fields.
function sourceMatch(doc: RerankedDocument): SemanticSearchMatch | Bm25SearchMatch {
  return doc.match as SemanticSearchMatch | Bm25SearchMatch;
}

export async function searchHybrid(options: HybridSearchOptions): Promise<HybridSearchResult> {
  const query = options.query.trim();
  const topK = Math.max(0, Math.floor(options.topK ?? 5));
  const candidateTopK = Math.max(topK * 4, topK);

  if (!query || topK === 0) {
    return {
      query,
      results: [],
    };
  }

  // Pull a wider candidate set from each retriever, then let rank fusion choose the final topK.
  const semantic = await searchSemantic({
    query,
    topK: candidateTopK,
    documentIds: options.documentIds,
    chunkTypes: options.chunkTypes,
  });

  const bm25 = await searchBm25({
    query,
    topK: candidateTopK,
    documentIds: options.documentIds,
    chunkTypes: options.chunkTypes,
  });

  // Keep original ranks/scores so reviewers can compare which retriever found each chunk.
  const semanticRankByChunk = new Map(
    semantic.results.map((match, index) => [match.chunkId, index + 1]),
  );
  const bm25RankByChunk = new Map(
    bm25.results.map((match, index) => [match.chunkId, index + 1]),
  );
  const semanticScoreByChunk = new Map(
    semantic.results.map((match) => [match.chunkId, match.score]),
  );
  const bm25ScoreByChunk = new Map(
    bm25.results.map((match) => [match.chunkId, match.score]),
  );

  // Weighted reciprocal rank is intentionally simple and works even when scores use different scales.
  const reranked = weightedReciprocalRankRerank(
    bm25.results.map((match) => toRerankDocument(match, "bm25Score")),
    semantic.results.map((match) => toRerankDocument(match, "semanticScore")),
    { limit: topK },
  );

  const results = reranked.map((doc) => {
    const match = sourceMatch(doc);

    return {
      chunkId: match.chunkId,
      documentId: match.documentId,
      sourcePath: match.sourcePath,
      sourceTitle: match.sourceTitle,
      pageIndex: match.pageIndex,
      chunkIndex: match.chunkIndex,
      chunkType: match.chunkType,
      content: match.content,
      score: doc.score,
      semanticRank: semanticRankByChunk.get(match.chunkId),
      bm25Rank: bm25RankByChunk.get(match.chunkId),
      semanticScore: semanticScoreByChunk.get(match.chunkId),
      bm25Score: bm25ScoreByChunk.get(match.chunkId),
      rerankSemanticScore: doc.vectorScore,
      rerankBm25Score: doc.bm25Score,
    };
  });

  return {
    query,
    results,
  };
}
