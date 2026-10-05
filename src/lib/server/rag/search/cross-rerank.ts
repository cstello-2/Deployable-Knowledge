import type { CrossEncoder } from './cross-encoders/cross-encoder';
import { getActiveCrossEncoder } from './cross-encoders/registry';

export type RerankCandidate = {
	chunkId: string;
	content: string;
};

export type RerankedCandidate = RerankCandidate & {
	relevance: number;
};

function validateScores(
	crossEncoder: CrossEncoder,
	scores: readonly number[],
	expectedCount: number
): void {
	if (scores.length !== expectedCount) {
		throw new Error(
			`${crossEncoder.name} returned ${scores.length} scores ` + `for ${expectedCount} passages.`
		);
	}

	scores.forEach((score, index) => {
		if (!Number.isFinite(score) || score < 0 || score > 1) {
			throw new Error(`${crossEncoder.name} returned an invalid score ` + `at index ${index}.`);
		}
	});
}

export async function rerankCandidates(
	query: string,
	candidates: RerankCandidate[],
	crossEncoder?: CrossEncoder
): Promise<RerankedCandidate[]> {
	const uniqueCandidates = [
		...new Map(candidates.map((candidate) => [candidate.chunkId, candidate])).values()
	];

	if (uniqueCandidates.length === 0) {
		return [];
	}

	const selectedCrossEncoder = crossEncoder ?? getActiveCrossEncoder();
	const passages = uniqueCandidates.map((candidate) => candidate.content);
	const scores = await selectedCrossEncoder.predict(query, passages);

	validateScores(selectedCrossEncoder, scores, uniqueCandidates.length);

	return uniqueCandidates
		.map((candidate, index) => ({
			candidate,
			originalIndex: index,
			score: scores[index]
		}))
		.sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex)
		.map(({ candidate, score }) => ({
			...candidate,
			relevance: score
		}));
}
