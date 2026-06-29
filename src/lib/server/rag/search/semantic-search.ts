// Exact semantic search over the stored chunk embeddings in SQLite.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../database/database";
import { document_chunks, documents } from "../../database/schema";
import { EMBEDDING_MODEL, embedTexts } from "../embedding-model";

export type SemanticSearchChunkType = "TEXT" | "TABLE" | "IMAGE";

export type SemanticSearchOptions = {
  query: string;
  topK?: number;
  documentIds?: string[];
  sourcePaths?: string[];
  chunkTypes?: SemanticSearchChunkType[];
  embeddingModel?: string;
};

export type SemanticSearchMatch = {
  chunkId: string;
  documentId: string;
  sourcePath: string;
  sourceTitle: string;
  pageIndex: number;
  chunkIndex: number;
  chunkType: SemanticSearchChunkType;
  content: string;
  score: number;
};

export type SemanticSearchResult = {
  query: string;
  results: SemanticSearchMatch[];
};

type CandidateRow = {
  chunkId: string;
  documentId: string;
  sourcePath: string;
  sourceTitle: string;
  pageIndex: number;
  chunkIndex: number;
  chunkType: SemanticSearchChunkType;
  content: string;
  embedding: Uint8Array | ArrayBuffer | null;
};

export async function searchSemantic(
  options: SemanticSearchOptions,
): Promise<SemanticSearchResult> {
  const query = options.query.trim();
  const topK = Math.max(0, Math.floor(options.topK ?? 5));
  const embeddingModel = options.embeddingModel?.trim() || EMBEDDING_MODEL;
  const documentIds = [...new Set((options.documentIds ?? []).map((value) => value.trim()).filter(Boolean))];
  const sourcePaths = [...new Set((options.sourcePaths ?? []).map((value) => value.trim()).filter(Boolean))];
  const chunkTypes = [...new Set((options.chunkTypes ?? []).map((value) => value.trim()).filter(Boolean))];

  if (!query || topK === 0) {
    return {
      query,
      results: [],
    };
  }

  // Same embedding path as chunking/storage so query vectors stay in sync with the corpus.
  const queryEmbedding = (await embedTexts([query]))[0] ?? [];
  const filters = [eq(document_chunks.embeddingModel, embeddingModel)];

  if (documentIds.length > 0) {
    filters.push(inArray(document_chunks.documentId, documentIds));
  }

  if (sourcePaths.length > 0) {
    filters.push(inArray(documents.sourcePath, sourcePaths));
  }

  if (chunkTypes.length > 0) {
    filters.push(inArray(document_chunks.chunkType, chunkTypes));
  }

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
    .where(and(...filters)) as CandidateRow[];

  // Stored vectors are Float32 bytes. We decode them once, then score with plain dot product.
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
    const limit = Math.min(queryEmbedding.length, vector.length);

    for (let index = 0; index < limit; index += 1) {
      score += queryEmbedding[index] * vector[index];
    }

    scoredRows.push({
      chunkId: row.chunkId,
      documentId: row.documentId,
      sourcePath: row.sourcePath,
      sourceTitle: row.sourceTitle,
      pageIndex: Number(row.pageIndex),
      chunkIndex: Number(row.chunkIndex),
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
