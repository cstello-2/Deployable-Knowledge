import { performance } from "node:perf_hooks";
import {
  searchSemantic,
  type SemanticSearchChunkType,
  type SemanticSearchMatch,
} from "./semantic-search";
import { searchBm25, type Bm25SearchMatch } from "./bm25-search";
import {
  reRankData,
  type Document,
  type RerankedDocument,
} from "./crossRerank";

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
  timings: {
    semanticMs: number;
    bm25Ms: number;
    rerankMs: number;
    totalMs: number;
    semanticCandidateCount: number;
    bm25CandidateCount: number;
    returnedCount: number;
  };
};

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

function sourceMatch(doc: RerankedDocument): SemanticSearchMatch | Bm25SearchMatch {
  return doc.match as SemanticSearchMatch | Bm25SearchMatch;
}

export async function searchHybrid(options: HybridSearchOptions): Promise<HybridSearchResult> {
  const totalStart = performance.now();
  const query = options.query.trim();
  const topK = Math.max(0, Math.floor(options.topK ?? 10));
  const candidateTopK = Math.max(topK * 4, topK);

  if (!query || topK === 0) {
    return {
      query,
      results: [],
      timings: {
        semanticMs: 0,
        bm25Ms: 0,
        rerankMs: 0,
        totalMs: Number((performance.now() - totalStart).toFixed(3)),
        semanticCandidateCount: 0,
        bm25CandidateCount: 0,
        returnedCount: 0,
      },
    };
  }

  const semanticStart = performance.now();
  const semantic = await searchSemantic({
    query,
    topK: candidateTopK,
    documentIds: options.documentIds,
    chunkTypes: options.chunkTypes,
  });
  const semanticMs = Number((performance.now() - semanticStart).toFixed(3));

  const bm25Start = performance.now();
  const bm25 = await searchBm25({
    query,
    topK: candidateTopK,
    documentIds: options.documentIds,
    chunkTypes: options.chunkTypes,
  });
  const bm25Ms = Number((performance.now() - bm25Start).toFixed(3));

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

  const rerankStart = performance.now();
  const reranked = await reRankData(
    query,
    bm25.results.map((match) => toRerankDocument(match, "bm25Score")),
    semantic.results.map((match) => toRerankDocument(match, "semanticScore")),
    { limit: topK },
  );
  const rerankMs = Number((performance.now() - rerankStart).toFixed(3));

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
      // Cross encoder gives single output instead of RRF's 2 output
      // Is set to 0 to avoid breaking current output structure
      rerankSemanticScore: 0,
      rerankBm25Score: 0,
    };
  });

  return {
    query,
    results,
    timings: {
      semanticMs,
      bm25Ms,
      rerankMs,
      totalMs: Number((performance.now() - totalStart).toFixed(3)),
      semanticCandidateCount: semantic.timings.candidateCount,
      bm25CandidateCount: bm25.timings.candidateCount,
      returnedCount: results.length,
    },
  };
}
