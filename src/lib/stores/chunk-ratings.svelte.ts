import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { ChunkRatingsService } from '$lib/services';
import type { ApiChunkRatingRequest, ApiSearchResults, ChunkRatingValue } from '$lib/types';
import { normalizeRetrievalQuery } from '$lib/utils';

interface ChunkRatingUpdate {
	chunkId: string;
	query: string;
	rating: ChunkRatingValue | null;
	retrievalMode: ApiChunkRatingRequest['retrievalMode'];
	resultRank: number;
}

class ChunkRatingsStore {
	private ratings = $state(new SvelteMap<string, ChunkRatingValue | null>());
	private saving = $state(new SvelteSet<string>());

	private key(query: string, chunkId: string): string {
		return `${normalizeRetrievalQuery(query)}\u0000${chunkId}`;
	}

	hydrate(query: string, results: ApiSearchResults): void {
		for (const matches of Object.values(results)) {
			for (const match of matches) {
				const key = this.key(query, match.chunkId);
				if (!this.saving.has(key)) this.ratings.set(key, match.rating);
			}
		}
	}

	ratingFor(query: string, chunkId: string): ChunkRatingValue | null {
		return this.ratings.get(this.key(query, chunkId)) ?? null;
	}

	isSaving(query: string, chunkId: string): boolean {
		return this.saving.has(this.key(query, chunkId));
	}

	async update(input: ChunkRatingUpdate): Promise<void> {
		const key = this.key(input.query, input.chunkId);
		const previous = this.ratings.get(key) ?? null;

		if (previous === input.rating || this.saving.has(key)) return;

		this.ratings.set(key, input.rating);
		this.saving.add(key);

		try {
			if (input.rating === null) {
				const response = await ChunkRatingsService.clear(input.chunkId, {
					query: input.query
				});
				this.ratings.set(key, response.rating);
			} else {
				const response = await ChunkRatingsService.set(input.chunkId, {
					query: input.query,
					rating: input.rating,
					retrievalMode: input.retrievalMode,
					resultRank: input.resultRank
				});
				this.ratings.set(key, response.rating);
			}
		} catch (error) {
			this.ratings.set(key, previous);
			throw error;
		} finally {
			this.saving.delete(key);
		}
	}
}

export const chunkRatingsStore = new ChunkRatingsStore();
