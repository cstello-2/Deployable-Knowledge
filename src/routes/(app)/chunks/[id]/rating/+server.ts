import { json, type RequestHandler } from '@sveltejs/kit';
import { CHUNK_RATING_VALUES } from '$lib/constants';
import { RetrievalMode } from '$lib/enums';
import { RetrievalFeedbackRepository } from '$lib/server/repositories';
import type {
	ApiChunkRatingDeleteRequest,
	ApiChunkRatingRequest,
	ApiChunkRatingResponse,
	ChunkRatingValue
} from '$lib/types';

const RETRIEVAL_MODES = new Set<string>(Object.values(RetrievalMode));

function isRequestObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readRequestObject(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const value: unknown = await request.json();
		return isRequestObject(value) ? value : null;
	} catch {
		return null;
	}
}

function isChunkRating(value: unknown): value is ChunkRatingValue {
	return typeof value === 'number' && CHUNK_RATING_VALUES.includes(value as ChunkRatingValue);
}

function isRetrievalMode(value: unknown): value is RetrievalMode {
	return typeof value === 'string' && RETRIEVAL_MODES.has(value);
}

export const PATCH: RequestHandler = async ({ params, request }) => {
	const chunkId = params.id;
	if (!chunkId) return json({ error: 'Missing chunk id.' }, { status: 400 });

	const body = await readRequestObject(request);
	if (!body) return json({ error: 'A JSON request body is required.' }, { status: 400 });

	const query = typeof body.query === 'string' ? body.query.trim() : '';
	const rating = body.rating;
	const resultRank = body.resultRank;
	const retrievalMode = body.retrievalMode;

	if (!query || query.length > 2_000) {
		return json({ error: 'A valid search query is required.' }, { status: 400 });
	}

	if (!isChunkRating(rating)) {
		return json({ error: 'Rating must be an integer from 1 through 5.' }, { status: 400 });
	}

	if (!isRetrievalMode(retrievalMode)) {
		return json({ error: 'A valid retrieval mode is required.' }, { status: 400 });
	}

	if (typeof resultRank !== 'number' || !Number.isInteger(resultRank) || resultRank < 1) {
		return json({ error: 'Result rank must be a positive integer.' }, { status: 400 });
	}

	const input: ApiChunkRatingRequest = {
		query,
		rating,
		retrievalMode,
		resultRank
	};
	const row = await RetrievalFeedbackRepository.set({
		chunkId,
		...input
	});

	if (!row) return json({ error: 'Chunk not found.' }, { status: 404 });

	return json({
		chunkId,
		rating: row.rating as ChunkRatingValue
	} satisfies ApiChunkRatingResponse);
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	const chunkId = params.id;
	if (!chunkId) return json({ error: 'Missing chunk id.' }, { status: 400 });

	const body = await readRequestObject(request);
	if (!body) return json({ error: 'A JSON request body is required.' }, { status: 400 });

	const query = typeof body.query === 'string' ? body.query.trim() : '';
	if (!query || query.length > 2_000) {
		return json({ error: 'A valid search query is required.' }, { status: 400 });
	}

	const input: ApiChunkRatingDeleteRequest = { query };
	await RetrievalFeedbackRepository.clear(chunkId, input.query);

	return json({
		chunkId,
		rating: null
	} satisfies ApiChunkRatingResponse);
};
