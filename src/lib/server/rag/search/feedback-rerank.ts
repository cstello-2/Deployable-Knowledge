import type { ChunkRatingValue } from '$lib/types';
import { RetrievalFeedbackRepository } from '$lib/server/repositories/retrieval-feedback.repository';
import type { ScoredSearchMatch } from './search-shared';

const FEEDBACK_CANDIDATE_MULTIPLIER = 3;
const MAX_FEEDBACK_CANDIDATES = 100;

type RetrievalFeedbackEffect =
	| 'strong_penalty'
	| 'mild_penalty'
	| 'neutral'
	| 'mild_boost'
	| 'strong_boost';

const FEEDBACK_EFFECT_BY_RATING: Record<ChunkRatingValue, RetrievalFeedbackEffect> = {
	1: 'strong_penalty',
	2: 'mild_penalty',
	3: 'neutral',
	4: 'mild_boost',
	5: 'strong_boost'
};

const FEEDBACK_ADJUSTMENT: Record<RetrievalFeedbackEffect, number> = {
	strong_penalty: -0.3,
	mild_penalty: -0.15,
	neutral: 0,
	mild_boost: 0.15,
	strong_boost: 0.3
};

export function feedbackCandidateLimit(topK: number): number {
	const requested = Math.max(0, Math.floor(topK));
	return Math.max(
		requested,
		Math.min(MAX_FEEDBACK_CANDIDATES, requested * FEEDBACK_CANDIDATE_MULTIPLIER)
	);
}

export async function rerankWithRetrievalFeedback(
	query: string,
	matches: ScoredSearchMatch[],
	limit: number
): Promise<ScoredSearchMatch[]> {
	const resultLimit = Math.max(0, Math.floor(limit));
	if (matches.length === 0 || resultLimit === 0) return [];

	const ratings = await RetrievalFeedbackRepository.findRatings(
		query,
		matches.map(({ chunkId }) => chunkId)
	);
	if (ratings.size === 0) return matches.slice(0, resultLimit);

	const scores = matches.map(({ score }) => score);
	const minimum = Math.min(...scores);
	const maximum = Math.max(...scores);
	const range = maximum - minimum;

	return matches
		.map((match, originalIndex) => {
			const normalizedScore = range > 0 ? (match.score - minimum) / range : 0.5;
			const rating = ratings.get(match.chunkId);
			const effect = rating === undefined ? 'neutral' : FEEDBACK_EFFECT_BY_RATING[rating];

			return {
				match,
				originalIndex,
				adjustedScore: normalizedScore + FEEDBACK_ADJUSTMENT[effect]
			};
		})
		.sort(
			(left, right) =>
				right.adjustedScore - left.adjustedScore || left.originalIndex - right.originalIndex
		)
		.slice(0, resultLimit)
		.map(({ match }) => match);
}
