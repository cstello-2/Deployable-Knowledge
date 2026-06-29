// Exact semantic search over the stored chunk embeddings in SQLite.

import { performance } from "node:perf_hooks";
import { databaseClient } from "../../database/database";
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

export type SemanticSearchTimings = {
  embedMs: number;
  loadCandidatesMs: number;
  decodeEmbeddingsMs: number;
  scoreMs: number;
  sortMs: number;
  totalMs: number;
  candidateCount: number;
  returnedCount: number;
};

export type SemanticSearchResult = {
  query: string;
  embeddingModel: string;
  results: SemanticSearchMatch[];
  timings: SemanticSearchTimings;
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
  const totalStart = performance.now();
  const query = options.query.trim();
  const topK = Math.max(0, Math.floor(options.topK ?? 5));
  const embeddingModel = options.embeddingModel?.trim() || EMBEDDING_MODEL;
  const documentIds = [...new Set((options.documentIds ?? []).map((value) => value.trim()).filter(Boolean))];
  const sourcePaths = [...new Set((options.sourcePaths ?? []).map((value) => value.trim()).filter(Boolean))];
  const chunkTypes = [...new Set((options.chunkTypes ?? []).map((value) => value.trim()).filter(Boolean))];

  const timings: SemanticSearchTimings = {
    embedMs: 0,
    loadCandidatesMs: 0,
    decodeEmbeddingsMs: 0,
    scoreMs: 0,
    sortMs: 0,
    totalMs: 0,
    candidateCount: 0,
    returnedCount: 0,
  };

  if (!query || topK === 0) {
    timings.totalMs = Number((performance.now() - totalStart).toFixed(3));
    return {
      query,
      embeddingModel,
      results: [],
      timings,
    };
  }

  // Same embedding path as chunking/storage so query vectors stay in sync with the corpus.
  const embedStart = performance.now();
  const queryEmbedding = (await embedTexts([query]))[0] ?? [];
  timings.embedMs = Number((performance.now() - embedStart).toFixed(3));

  // Keep the SQL simple for now. We only add filters that the caller actually sent.
  const loadStart = performance.now();
  const filters: string[] = ["dc.embedding_model = ?"];
  const args: Array<string> = [embeddingModel];

  if (documentIds.length > 0) {
    filters.push(`dc.document_id in (${documentIds.map(() => "?").join(", ")})`);
    args.push(...documentIds);
  }

  if (sourcePaths.length > 0) {
    filters.push(`d.source_path in (${sourcePaths.map(() => "?").join(", ")})`);
    args.push(...sourcePaths);
  }

  if (chunkTypes.length > 0) {
    filters.push(`dc.chunk_type in (${chunkTypes.map(() => "?").join(", ")})`);
    args.push(...chunkTypes);
  }

  const querySql = `
    select
      dc.id as chunkId,
      dc.document_id as documentId,
      d.source_path as sourcePath,
      d.title as sourceTitle,
      dc.page_index as pageIndex,
      dc.chunk_index as chunkIndex,
      dc.chunk_type as chunkType,
      dc.content as content,
      dc.embedding as embedding
    from document_chunks dc
    join documents d on d.id = dc.document_id
    where ${filters.join(" and ")}
  `;

  const rawRows = await databaseClient.execute({
    sql: querySql,
    args,
  });
  timings.loadCandidatesMs = Number((performance.now() - loadStart).toFixed(3));

  const candidateRows = rawRows.rows as unknown as CandidateRow[];
  timings.candidateCount = candidateRows.length;

  // Stored vectors are Float32 bytes. We decode them once, then score with plain dot product.
  const decodeStart = performance.now();
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
  timings.decodeEmbeddingsMs = Number((performance.now() - decodeStart).toFixed(3));

  const scoreStart = performance.now();
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
  timings.scoreMs = Number((performance.now() - scoreStart).toFixed(3));

  const sortStart = performance.now();
  scoredRows.sort((left, right) => right.score - left.score);
  const results = scoredRows.slice(0, topK);
  timings.sortMs = Number((performance.now() - sortStart).toFixed(3));
  timings.returnedCount = results.length;
  timings.totalMs = Number((performance.now() - totalStart).toFixed(3));

  return {
    query,
    embeddingModel,
    results,
    timings,
  };
}
