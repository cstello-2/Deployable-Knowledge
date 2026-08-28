export const CHUNK_RATING_VALUES = [1, 2, 3, 4, 5] as const;

export type ChunkRatingValue = (typeof CHUNK_RATING_VALUES)[number];

export const CHUNK_RATING_LABELS = {
	1: 'Irrelevant',
	2: 'Weak match',
	3: 'Partially Useful',
	4: 'Relevant',
	5: 'Highly Relevant'
} satisfies Record<ChunkRatingValue, string>;
