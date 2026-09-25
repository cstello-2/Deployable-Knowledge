import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { RetrievalMode } from '$lib/enums';
import type { ChunkRatingValue } from '$lib/types';
import { db } from '$lib/server/database/database';
import { documentChunks, retrievalFeedback } from '$lib/server/database/schema';
import { normalizeRetrievalQuery } from '$lib/utils';

interface SetRetrievalFeedbackInput {
	chunkId: string;
	query: string;
	rating: ChunkRatingValue;
	retrievalMode: RetrievalMode;
	resultRank: number;
}

function hashQuery(query: string): string {
	return createHash('sha256').update(normalizeRetrievalQuery(query)).digest('hex');
}

export class RetrievalFeedbackRepository {
	static async findRatings(
		query: string,
		chunkIds: readonly string[]
	): Promise<Map<string, ChunkRatingValue>> {
		const uniqueChunkIds = [...new Set(chunkIds)];
		if (uniqueChunkIds.length === 0) return new Map();

		const rows = await db
			.select({
				chunkId: retrievalFeedback.chunkId,
				rating: retrievalFeedback.rating
			})
			.from(retrievalFeedback)
			.where(
				and(
					eq(retrievalFeedback.queryHash, hashQuery(query)),
					inArray(retrievalFeedback.chunkId, uniqueChunkIds)
				)
			);

		return new Map(rows.map(({ chunkId, rating }) => [chunkId, rating as ChunkRatingValue]));
	}

	static async set(input: SetRetrievalFeedbackInput) {
		const chunk = await db
			.select({ id: documentChunks.id })
			.from(documentChunks)
			.where(eq(documentChunks.id, input.chunkId))
			.get();

		if (!chunk) return null;

		const timestamp = new Date().toISOString();
		const [row] = await db
			.insert(retrievalFeedback)
			.values({
				id: randomUUID(),
				chunkId: input.chunkId,
				query: input.query.trim(),
				queryHash: hashQuery(input.query),
				rating: input.rating,
				retrievalMode: input.retrievalMode,
				resultRank: input.resultRank,
				createdAt: timestamp,
				updatedAt: timestamp
			})
			.onConflictDoUpdate({
				target: [retrievalFeedback.chunkId, retrievalFeedback.queryHash],
				set: {
					query: input.query.trim(),
					rating: input.rating,
					retrievalMode: input.retrievalMode,
					resultRank: input.resultRank,
					updatedAt: timestamp
				}
			})
			.returning();

		return row;
	}

	static async clear(chunkId: string, query: string): Promise<void> {
		await db
			.delete(retrievalFeedback)
			.where(
				and(
					eq(retrievalFeedback.chunkId, chunkId),
					eq(retrievalFeedback.queryHash, hashQuery(query))
				)
			);
	}
}
