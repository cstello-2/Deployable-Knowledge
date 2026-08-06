import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { and, eq, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { DEFAULT_ASSISTANT_CONFIG } from '$lib/constants';
import { db } from '../../database/database';
import { documentChunks, documents } from '../../database/schema';
import { embedTexts } from '../embedding-model';
import { getVectorIndex } from './vector-index';
import {
	cleanFilterValues,
	type ScoredSearchMatch,
	type SearchOptionsBase,
	type SearchResult
} from './search-shared';

export type SemanticSearchMatch = ScoredSearchMatch;
export type SemanticSearchResult = SearchResult<SemanticSearchMatch>;

const SCORE_BLOCK_SIZE = 16_384;

type TopCandidate = { row: number; score: number };

function addTopCandidate(list: TopCandidate[], limit: number, row: number, score: number): void {
	if (list.length === limit && score <= list[list.length - 1].score) return;
	let index = list.length;
	while (index > 0 && list[index - 1].score < score) index -= 1;
	list.splice(index, 0, { row, score });
	if (list.length > limit) list.pop();
}

export async function searchSemantic(options: SearchOptionsBase): Promise<SemanticSearchResult> {
	const query = options.query.trim();
	// Keeps topK as a non-negative integer before using it as a result limit
	const topK = Math.max(0, Math.floor(options.topK ?? DEFAULT_ASSISTANT_CONFIG.ragTopK));
	const documentIds = cleanFilterValues(options.documentIds);
	const sourcePaths = cleanFilterValues(options.sourcePaths);
	const chunkTypes = cleanFilterValues(options.chunkTypes);

	// Empty queries should not run embedding/model work.
	if (!query || topK === 0) {
		return { query, results: [] };
	}

	// Same embedding path as chunking/storage so query vectors stay in sync with the corpus
	const [queryEmbedding, index] = await Promise.all([
		embedTexts([query], 'search_query').then((vectors) => vectors[0] ?? new Float32Array(0)),
		getVectorIndex()
	]);
	if (index.count === 0 || queryEmbedding.length !== index.dimensions) {
		return { query, results: [] };
	}

	// Deactivated documents never surface in retrieval, even when explicitly requested
	const documentFilters: SQL[] = [eq(documents.active, true)];
	if (documentIds.length > 0) documentFilters.push(inArray(documents.id, documentIds));
	if (sourcePaths.length > 0) documentFilters.push(inArray(documents.sourcePath, sourcePaths));
	const allowedRows = await db
		.select({ id: documents.id })
		.from(documents)
		.where(and(...documentFilters));
	const allowedDocuments = new Set(allowedRows.map(({ id }) => id));
	const allowedTypes = chunkTypes.length > 0 ? new Set(chunkTypes) : null;

	const { matrix, dimensions } = index;
	const top: TopCandidate[] = [];

	for (let row = 0; row < index.count; row += 1) {
		if (row > 0 && row % SCORE_BLOCK_SIZE === 0) await yieldEventLoop();
		if (!allowedDocuments.has(index.documentIds[row])) continue;
		if (allowedTypes && !allowedTypes.has(index.chunkTypes[row])) continue;

		// Embeddings are normalized, so dot product is the cosine score
		let score = 0;
		const base = row * dimensions;
		for (let dim = 0; dim < dimensions; dim += 1) {
			score += queryEmbedding[dim] * matrix[base + dim];
		}
		addTopCandidate(top, topK, row, score);
	}

	if (top.length === 0) {
		return { query, results: [] };
	}

	const winnerIds = top.map(({ row }) => index.chunkIds[row]);
	const winnerRows = await db
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
		.innerJoin(documents, eq(documents.id, documentChunks.documentId))
		.where(inArray(documentChunks.id, winnerIds));
	const rowsByChunkId = new Map(winnerRows.map((row) => [row.chunkId, row]));

	const results: SemanticSearchMatch[] = [];
	for (const { row, score } of top) {
		const match = rowsByChunkId.get(index.chunkIds[row]);
		if (match) results.push({ ...match, score });
	}

	return { query, results };
}
