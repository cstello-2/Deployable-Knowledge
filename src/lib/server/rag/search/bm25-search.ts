// DB-backed BM25 search.

// @ts-ignore wink-bm25-text-search does not ship useful TS types.
import BM25Engine from "wink-bm25-text-search";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { stemmer } from "stemmer";
import { eng } from "stopword";
import { db } from "../../database/database";
import { document_chunks, documents } from "../../database/schema";
import type { SemanticSearchChunkType } from "./semantic-search";

export type Bm25SearchOptions = {
  query: string;
  topK?: number;
  documentIds?: string[];
  sourcePaths?: string[];
  chunkTypes?: SemanticSearchChunkType[];
};

export type Bm25SearchMatch = {
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

export type Bm25SearchResult = {
  query: string;
  results: Bm25SearchMatch[];
};

type CandidateRow = Omit<Bm25SearchMatch, "score">;

function uniqueClean(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function buildEngine() {
  const engine = BM25Engine();
  const stopWordsSet = new Set(eng);

  engine.defineConfig({
    fldWeights: { content: 1 },
  });

  engine.definePrepTasks([
    (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ""),
    (text: string) => text.split(/\s+/),
    (tokens: string[]) =>
      tokens
        .filter((token) => token.length > 0 && !stopWordsSet.has(token))
        .map((token) => stemmer(token)),
  ]);

  return engine;
}

async function loadCandidates({
  documentIds,
  sourcePaths,
  chunkTypes,
}: {
  documentIds: string[];
  sourcePaths: string[];
  chunkTypes: string[];
}) {
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

  const query = db
    .select({
      chunkId: document_chunks.id,
      documentId: document_chunks.documentId,
      sourcePath: documents.sourcePath,
      sourceTitle: documents.title,
      pageIndex: document_chunks.pageIndex,
      chunkIndex: document_chunks.chunkIndex,
      chunkType: document_chunks.chunkType,
      content: document_chunks.content,
    })
    .from(document_chunks)
    .innerJoin(documents, eq(documents.id, document_chunks.documentId));

  const rows = filters.length > 0
    ? await query.where(and(...filters))
    : await query;

  return rows as CandidateRow[];
}

export async function searchBm25(options: Bm25SearchOptions): Promise<Bm25SearchResult> {
  const query = options.query.trim();
  const topK = Math.max(0, Math.floor(options.topK ?? 5));
  const documentIds = uniqueClean(options.documentIds);
  const sourcePaths = uniqueClean(options.sourcePaths);
  const chunkTypes = uniqueClean(options.chunkTypes);

  if (!query || topK === 0) {
    return { query, results: [] };
  }

  const candidates = await loadCandidates({ documentIds, sourcePaths, chunkTypes });

  if (candidates.length === 0) {
    return { query, results: [] };
  }

  const engine = buildEngine();
  const byChunkId = new Map<string, CandidateRow>();

  for (const row of candidates) {
    byChunkId.set(row.chunkId, row);
    engine.addDoc({ content: row.content }, row.chunkId);
  }

  engine.consolidate();

  const rawResults = engine.search(query, topK) as Array<[string, number]>;
  const results = rawResults.flatMap(([chunkId, score]) => {
    const row = byChunkId.get(chunkId);
    if (!row) return [];

    return [{
      ...row,
      pageIndex: Number(row.pageIndex),
      chunkIndex: Number(row.chunkIndex),
      score,
    }];
  });

  return { query, results };
}
