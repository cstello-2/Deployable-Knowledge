// Hybrid Search File to Combine Semantic & BM25 Search

// --- Specfic Search Work Flow ---

//  -Clean & Normalize user query
//  -Run semantic search
//  -Run BM25 search
//  -Track original ranks and scores by chunkId
//  -Convert results into reranker documents. Maps result into shape crossRerank expects
//  -Run cross reranker
//  -Map reranked docs back to search result. Restores chunk fields like documentId, sourceTitle, etc

// -------------------------------


import {
  searchSemantic,
  type SemanticSearchMatch,
} from "./semantic-search";
import { searchBm25, type Bm25SearchMatch } from "./bm25-search";
import {
  reRankData,
  type Document,
  type RerankedDocument,
} from "./crossRerank";
import {
  type SearchChunkType,
  type SearchMatchBase,
  type SearchResult,
} from "./search-shared";

export type HybridSearchOptions = {
  query: string;
  topK?: number;
  documentIds?: string[];
  chunkTypes?: SearchChunkType[];
};

export type HybridSearchMatch = SearchMatchBase & {
  semanticRank?: number;
  bm25Rank?: number;
  semanticScore?: number;
  bm25Score?: number;
  rerankSemanticScore: number;
  rerankBm25Score: number;
};

export type HybridSearchResult = SearchResult<HybridSearchMatch>;

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
  const query = options.query.trim();
  // Keeps topK as a non-negative integer before using it as a result limit
  const topK = Math.max(0, Math.floor(options.topK ?? 10));
  const candidateTopK = Math.max(topK * 2, topK); // Number of chunks from search types: ragTopK = 5, 5 * 2 = 10 Semantic & BM25 chunks each

  if (!query || topK === 0) {
    return {
      query,
      results: [],
    };
  }

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

  const reranked = await reRankData(
    query,
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
      // Cross encoder gives single output instead of RRF's 2 output
      // Is set to 0 to avoid breaking current output structure
      rerankSemanticScore: 0,
      rerankBm25Score: 0,
    };
  });

  return {
    query,
    results,
  };
}
