// DB-backed BM25 search.

// @ts-ignore wink-bm25-text-search does not ship useful TS types.
import BM25Engine from "wink-bm25-text-search";
import { performance } from "node:perf_hooks";
import { stemmer } from "stemmer";
import { eng } from "stopword";
import { databaseClient } from "../../database/database";
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

export type Bm25SearchTimings = {
  loadCandidatesMs: number;
  indexMs: number;
  searchMs: number;
  totalMs: number;
  candidateCount: number;
  returnedCount: number;
};

export type Bm25SearchResult = {
  query: string;
  results: Bm25SearchMatch[];
  timings: Bm25SearchTimings;
};

type CandidateRow = Bm25SearchMatch;

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
  const filters: string[] = [];
  const args: string[] = [];

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

  const whereSql = filters.length > 0 ? `where ${filters.join(" and ")}` : "";
  const rows = await databaseClient.execute({
    sql: `
      select
        dc.id as chunkId,
        dc.document_id as documentId,
        d.source_path as sourcePath,
        d.title as sourceTitle,
        dc.page_index as pageIndex,
        dc.chunk_index as chunkIndex,
        dc.chunk_type as chunkType,
        dc.content as content
      from document_chunks dc
      join documents d on d.id = dc.document_id
      ${whereSql}
    `,
    args,
  });

  return rows.rows as unknown as CandidateRow[];
}

export async function searchBm25(options: Bm25SearchOptions): Promise<Bm25SearchResult> {
  const totalStart = performance.now();
  const query = options.query.trim();
  const topK = Math.max(0, Math.floor(options.topK ?? 5));
  const documentIds = uniqueClean(options.documentIds);
  const sourcePaths = uniqueClean(options.sourcePaths);
  const chunkTypes = uniqueClean(options.chunkTypes);

  const timings: Bm25SearchTimings = {
    loadCandidatesMs: 0,
    indexMs: 0,
    searchMs: 0,
    totalMs: 0,
    candidateCount: 0,
    returnedCount: 0,
  };

  if (!query || topK === 0) {
    timings.totalMs = Number((performance.now() - totalStart).toFixed(3));
    return { query, results: [], timings };
  }

  const loadStart = performance.now();
  const candidates = await loadCandidates({ documentIds, sourcePaths, chunkTypes });
  timings.loadCandidatesMs = Number((performance.now() - loadStart).toFixed(3));
  timings.candidateCount = candidates.length;

  if (candidates.length === 0) {
    timings.totalMs = Number((performance.now() - totalStart).toFixed(3));
    return { query, results: [], timings };
  }

  const indexStart = performance.now();
  const engine = buildEngine();
  const byChunkId = new Map<string, CandidateRow>();

  for (const row of candidates) {
    byChunkId.set(row.chunkId, row);
    engine.addDoc({ content: row.content }, row.chunkId);
  }

  engine.consolidate();
  timings.indexMs = Number((performance.now() - indexStart).toFixed(3));

  const searchStart = performance.now();
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
  timings.searchMs = Number((performance.now() - searchStart).toFixed(3));
  timings.returnedCount = results.length;
  timings.totalMs = Number((performance.now() - totalStart).toFixed(3));

  return { query, results, timings };
}
