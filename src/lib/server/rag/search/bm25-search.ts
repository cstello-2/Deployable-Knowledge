// DB-backed BM25 search.

// @ts-expect-error wink-bm25-text-search does not ship useful TS types.
import BM25Engine from 'wink-bm25-text-search';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { stemmer } from 'stemmer';
import { eng } from 'stopword';
import { DEFAULT_ASSISTANT_CONFIG } from '$lib/constants';
import { db } from '../../database/database';
import { documentChunks, documents } from '../../database/schema';
import { isUsefulImageText } from '../chunk/ocr-text-quality';
import {
	cleanFilterValues,
	type ScoredSearchMatch,
	type SearchChunkType,
	type SearchOptionsBase,
	type SearchResult
} from './search-shared';

export type Bm25SearchOptions = SearchOptionsBase;

export type Bm25SearchMatch = ScoredSearchMatch;
export type Bm25SearchResult = SearchResult<Bm25SearchMatch>;

type CandidateRow = Omit<Bm25SearchMatch, 'score'>;

function buildEngine() {
	const engine = BM25Engine();
	const stopWordsSet = new Set(eng);

	engine.defineConfig({
		fldWeights: { content: 1 }
	});

	engine.definePrepTasks([
		(text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ''),
		(text: string) => text.split(/\s+/),
		(tokens: string[]) =>
			tokens
				.filter((token) => token.length > 0 && !stopWordsSet.has(token))
				.map((token) => stemmer(token))
	]);

	return engine;
}

async function loadCandidates({
	documentIds,
	sourcePaths,
	chunkTypes
}: {
	documentIds: string[];
	sourcePaths: string[];
	chunkTypes: SearchChunkType[];
}) {
	// Deactivated documents never surface in retrieval, even when explicitly requested
	const filters: SQL[] = [eq(documents.active, true)];

	if (documentIds.length > 0) {
		filters.push(inArray(documentChunks.documentId, documentIds));
	}

	if (sourcePaths.length > 0) {
		filters.push(inArray(documents.sourcePath, sourcePaths));
	}

	if (chunkTypes.length > 0) {
		filters.push(inArray(documentChunks.chunkType, chunkTypes));
	}

	const query = db
		.select({
			chunkId: documentChunks.id,
			documentId: documentChunks.documentId,
			sourcePath: documents.sourcePath,
			sourceTitle: documents.title,
			sourceType: documents.sourceType,
			pageIndex: documentChunks.pageIndex,
			chunkIndex: documentChunks.chunkIndex,
			chunkType: documentChunks.chunkType,
			content: documentChunks.content
		})
		.from(documentChunks)
		.innerJoin(documents, eq(documents.id, documentChunks.documentId));

	const rows = filters.length > 0 ? await query.where(and(...filters)) : await query;

	return rows as CandidateRow[];
}

export async function searchBm25(options: Bm25SearchOptions): Promise<Bm25SearchResult> {
	const query = options.query.trim();
	// Keeps topK as a non-negative integer before using it as a result limit
	const topK = Math.max(0, Math.floor(options.topK ?? DEFAULT_ASSISTANT_CONFIG.ragTopK));
	const documentIds = cleanFilterValues(options.documentIds);
	const sourcePaths = cleanFilterValues(options.sourcePaths);
	const chunkTypes = cleanFilterValues(options.chunkTypes);

	if (!query || topK === 0) {
		return { query, results: [] };
	}

	const candidates = (await loadCandidates({ documentIds, sourcePaths, chunkTypes })).filter(
		(candidate) => candidate.chunkType !== 'IMAGE' || isUsefulImageText(candidate.content)
	);

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

		return [
			{
				...row,
				score
			}
		];
	});

	return { query, results };
}
