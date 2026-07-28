// Shared helpers for search modules

import type { Document, DocumentChunk } from "../../database/schema";

// Same chunk type values used by stored chunks and every search mode
export type SearchChunkType = DocumentChunk["chunkType"];

// Common search input shared by BM25, semantic, and hybrid search
export type SearchOptionsBase = {
  query: string;
  topK?: number;
  documentIds?: string[];
  sourcePaths?: string[];
  chunkTypes?: SearchChunkType[];
};

// Common fields returned by every chunk search result
export type SearchMatchBase = {
  chunkId: string;
  documentId: string;
  sourcePath: string;
  sourceType: Document["sourceType"];
  sourceTitle: string;
  sourceType: Document["sourceType"];
  pageIndex: number;
  chunkIndex: number;
  chunkType: SearchChunkType;
  content: string;
};

export type ScoredSearchMatch = SearchMatchBase & {
  score: number;
};

export type RelevanceSearchMatch = SearchMatchBase & {
  relevanceScore: number;
};

// All search modules return the normalized query plus ranked results
export type SearchResult<TMatch extends SearchMatchBase> = {
  query: string;
  results: TMatch[];
};

// Search filters come from user/UI input, so trim, drop blanks, and dedupe before querying
export function cleanFilterValues<T extends string>(values: readonly T[] | undefined): T[] {
  const cleaned = new Set<T>();
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (trimmed) {
      cleaned.add(trimmed as T);
    }
  }

  return [...cleaned];
}
