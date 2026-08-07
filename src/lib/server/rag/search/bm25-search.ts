// DB-backed BM25 search.

import { DEFAULT_ASSISTANT_CONFIG } from '$lib/constants';
import { databaseClient } from '../../database/database';
import { ensureChunkFts } from '../../database/chunk-fts';
import {
	cleanFilterValues,
	type ScoredSearchMatch,
	type SearchOptionsBase,
	type SearchResult
} from './search-shared';

export type Bm25SearchOptions = SearchOptionsBase;

export type Bm25SearchMatch = ScoredSearchMatch;
export type Bm25SearchResult = SearchResult<Bm25SearchMatch>;

function buildMatchExpression(query: string): string | null {
	const tokens = query.toLowerCase().match(/[a-z0-9]+/g);
	if (!tokens?.length) return null;
	return tokens.map((token) => `"${token}"`).join(' OR ');
}

export async function searchBm25(options: Bm25SearchOptions): Promise<Bm25SearchResult> {
	const query = options.query.trim();
	// Keeps topK as a non-negative integer before using it as a result limit
	const topK = Math.max(0, Math.floor(options.topK ?? DEFAULT_ASSISTANT_CONFIG.ragTopK));
	const documentIds = cleanFilterValues(options.documentIds);
	const sourcePaths = cleanFilterValues(options.sourcePaths);
	const chunkTypes = cleanFilterValues(options.chunkTypes);

	const match = buildMatchExpression(query);
	if (!query || !match || topK === 0) {
		return { query, results: [] };
	}

	await ensureChunkFts();

	// Deactivated documents never surface in retrieval, even when explicitly requested
	const conditions = ['d.active = 1'];
	const args: (string | number)[] = [match];

	const placeholders = (values: string[]) => values.map(() => '?').join(', ');
	if (documentIds.length > 0) {
		conditions.push(`dc.document_id IN (${placeholders(documentIds)})`);
		args.push(...documentIds);
	}
	if (sourcePaths.length > 0) {
		conditions.push(`d.source_path IN (${placeholders(sourcePaths)})`);
		args.push(...sourcePaths);
	}
	if (chunkTypes.length > 0) {
		conditions.push(`dc.chunk_type IN (${placeholders(chunkTypes)})`);
		args.push(...chunkTypes);
	}
	args.push(topK);

	const result = await databaseClient.execute({
		sql: `SELECT
				dc.id AS chunkId,
				dc.document_id AS documentId,
				d.source_path AS sourcePath,
				d.title AS sourceTitle,
				d.source_type AS sourceType,
				dc.page_index AS pageIndex,
				dc.chunk_index AS chunkIndex,
				dc.chunk_type AS chunkType,
				dc.content AS content,
				-bm25(chunk_fts) AS score
			FROM chunk_fts
			JOIN document_chunks dc ON dc.rowid = chunk_fts.rowid
			JOIN documents d ON d.id = dc.document_id
			WHERE chunk_fts MATCH ? AND ${conditions.join(' AND ')}
			ORDER BY bm25(chunk_fts)
			LIMIT ?`,
		args
	});

	return { query, results: result.rows as unknown as Bm25SearchMatch[] };
}
