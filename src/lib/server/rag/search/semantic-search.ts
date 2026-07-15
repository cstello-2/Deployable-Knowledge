// Exact semantic search over the stored chunk embeddings in SQLite

import { and, eq, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../../database/database";
import { document_chunks, documents } from "../../database/schema";
import { embedTexts } from "../embedding-model";
import {
  cleanFilterValues,
  type ScoredSearchMatch,
  type SearchChunkType,
  type SearchOptionsBase,
  type SearchResult,
} from "./search-shared";

export type SemanticSearchMatch = ScoredSearchMatch;
export type SemanticSearchResult = SearchResult<SemanticSearchMatch>;

type CandidateRow = {
  chunkId: string;
  documentId: string;
  sourcePath: string;
  sourceTitle: string;
  pageIndex: number;
  chunkIndex: number;
  chunkType: SearchChunkType;
  content: string;
  embedding: Uint8Array | ArrayBuffer | null;
};

// Semantic search scores the query against stored chunk embeddings already in SQLite
export async function searchSemantic(
  options: SearchOptionsBase,
): Promise<SemanticSearchResult> {
  const query = options.query.trim();
  // Keeps topK as a non-negative integer before using it as a result limit
  const topK = Math.max(0, Math.floor(options.topK ?? 5));
  const documentIds = cleanFilterValues(options.documentIds);
  const sourcePaths = cleanFilterValues(options.sourcePaths);
  const chunkTypes = cleanFilterValues(options.chunkTypes);

  // Empty queries should not run embedding/model work.
  if (!query || topK === 0) {
    return {
      query,
      results: [],
    };
  }

  // Same embedding path as chunking/storage so query vectors stay in sync with the corpus
  const queryEmbedding = (await embedTexts([query], "search_query"))[0] ?? [];
  const filters: SQL[] = [];

  if (documentIds.length > 0) {
    filters.push(inArray(document_chunks.documentId, documentIds));
  }

  if (sourcePaths.length > 0) {
    filters.push(inArray(documents.sourcePath, sourcePaths));
  }

  if (chunkTypes.length > 0) {
    filters.push(inArray(document_chunks.chunkType, chunkTypes));
  }

  // Use Drizzle for the row query, then do vector math in TS
  const candidateRows = await db
    .select({
      chunkId: document_chunks.id,
      documentId: document_chunks.documentId,
      sourcePath: documents.sourcePath,
      sourceTitle: documents.title,
      pageIndex: document_chunks.pageIndex,
      chunkIndex: document_chunks.chunkIndex,
      chunkType: document_chunks.chunkType,
      content: document_chunks.content,
      embedding: document_chunks.embedding,
    })
    .from(document_chunks)
    .innerJoin(documents, eq(documents.id, document_chunks.documentId))
    .where(filters.length ? and(...filters) : undefined) as CandidateRow[];

  // Stored vectors are Float32 bytes. Decode them once before scoring
  const decodedCandidates = candidateRows.map((row) => {
    const rawEmbedding = row.embedding;

    if (!rawEmbedding) {
      throw new Error(`Chunk ${row.chunkId} is missing its embedding bytes.`);
    }

    let bytes: Uint8Array;
    if (rawEmbedding instanceof Uint8Array) {
      bytes = rawEmbedding;
    } else if (rawEmbedding instanceof ArrayBuffer) {
      bytes = new Uint8Array(rawEmbedding);
    } else {
      throw new Error(`Chunk ${row.chunkId} returned an unsupported embedding shape.`);
    }

    const vector = new Float32Array(
      bytes.buffer,
      bytes.byteOffset,
      Math.floor(bytes.byteLength / Float32Array.BYTES_PER_ELEMENT),
    );

    return {
      row,
      vector,
    };
  });

  const scoredRows: SemanticSearchMatch[] = [];

  for (const candidate of decodedCandidates) {
    const { row, vector } = candidate;

    let score = 0;

    // Embeddings are normalized, so dot product is the cosine score
    for (let index = 0; index < queryEmbedding.length; index += 1) {
      score += queryEmbedding[index] * vector[index]; // dot product
    }
    scoredRows.push({
      chunkId: row.chunkId,
      documentId: row.documentId,
      sourcePath: row.sourcePath,
      sourceTitle: row.sourceTitle,
      pageIndex: row.pageIndex,
      chunkIndex: row.chunkIndex,
      chunkType: row.chunkType,
      content: row.content,
      score,
    });
  }

  scoredRows.sort((left, right) => right.score - left.score);
  const results = scoredRows.slice(0, topK);

  return {
    query,
    results,
  };
}
