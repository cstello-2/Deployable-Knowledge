import type { ScoredSearchMatch } from './search-shared';

const DEFAULT_RANK_CONSTANT = 60;
const DEFAULT_SEMANTIC_WEIGHT = 1;
const DEFAULT_BM25_WEIGHT = 1;

type RrfSource = 'semantic' | 'bm25';

type FusionCandidate = {
	match: ScoredSearchMatch;
	semanticRank: number | undefined;
	bm25Rank: number | undefined;
	rrfScore: number;
};

export type RrfFusionOptions = {
	rankConstant?: number;
	semanticWeight?: number;
	bm25Weight?: number;
};

export type RrfFusedMatch = {
	match: ScoredSearchMatch;
	semanticRank: number | undefined;
	bm25Rank: number | undefined;
	rrfScore: number;
	score: number;
};

function validateOptions(rankConstant: number, semanticWeight: number, bm25Weight: number): void {
	if (!Number.isFinite(rankConstant) || rankConstant < 0) {
		throw new Error('RRF rank constant must be a finite non-negative number');
	}

	if (!Number.isFinite(semanticWeight) || semanticWeight < 0) {
		throw new Error('RRF semantic weight must be a finite non-negative number');
	}

	if (!Number.isFinite(bm25Weight) || bm25Weight < 0) {
		throw new Error('RRF BM25 weight must be a finite non-negative number');
	}

	if (semanticWeight + bm25Weight === 0) {
		throw new Error('At least one RRF retriever weight must be greater than zero');
	}
}

function addRankedResults(
	candidates: Map<string, FusionCandidate>,
	results: readonly ScoredSearchMatch[],
	source: RrfSource,
	weight: number,
	rankConstant: number
): void {
	if (weight === 0) return;

	const seenChunkIds = new Set<string>();
	let rank = 0;

	for (const match of results) {
		if (seenChunkIds.has(match.chunkId)) continue;

		seenChunkIds.add(match.chunkId);
		rank += 1;

		let candidate = candidates.get(match.chunkId);

		if (!candidate) {
			candidate = {
				match,
				semanticRank: undefined,
				bm25Rank: undefined,
				rrfScore: 0
			};
			candidates.set(match.chunkId, candidate);
		}

		candidate.rrfScore += weight / (rankConstant + rank);

		if (source === 'semantic') {
			candidate.semanticRank = rank;
		} else {
			candidate.bm25Rank = rank;
		}
	}
}

function bestRank(candidate: FusionCandidate): number {
	return Math.min(candidate.semanticRank ?? Infinity, candidate.bm25Rank ?? Infinity);
}

function availableRankSum(candidate: FusionCandidate): number {
	return (candidate.semanticRank ?? 0) + (candidate.bm25Rank ?? 0);
}

export function fuseSearchResultsRrf(
	semanticResults: readonly ScoredSearchMatch[],
	bm25Results: readonly ScoredSearchMatch[],
	options: RrfFusionOptions = {}
): RrfFusedMatch[] {
	const rankConstant = options.rankConstant ?? DEFAULT_RANK_CONSTANT;
	const semanticWeight = options.semanticWeight ?? DEFAULT_SEMANTIC_WEIGHT;
	const bm25Weight = options.bm25Weight ?? DEFAULT_BM25_WEIGHT;

	validateOptions(rankConstant, semanticWeight, bm25Weight);

	const candidates = new Map<string, FusionCandidate>();

	addRankedResults(candidates, semanticResults, 'semantic', semanticWeight, rankConstant);
	addRankedResults(candidates, bm25Results, 'bm25', bm25Weight, rankConstant);

	const maximumScore = (semanticWeight + bm25Weight) / (rankConstant + 1);

	return [...candidates.values()]
		.sort((left, right) => {
			const scoreDifference = right.rrfScore - left.rrfScore;
			if (scoreDifference !== 0) return scoreDifference;

			const bestRankDifference = bestRank(left) - bestRank(right);
			if (bestRankDifference !== 0) return bestRankDifference;

			const rankSumDifference = availableRankSum(left) - availableRankSum(right);
			if (rankSumDifference !== 0) return rankSumDifference;

			if (left.match.chunkId < right.match.chunkId) return -1;
			if (left.match.chunkId > right.match.chunkId) return 1;
			return 0;
		})
		.map((candidate) => ({
			match: candidate.match,
			semanticRank: candidate.semanticRank,
			bm25Rank: candidate.bm25Rank,
			rrfScore: candidate.rrfScore,
			score: Math.min(1, Math.max(0, candidate.rrfScore / maximumScore))
		}));
}
