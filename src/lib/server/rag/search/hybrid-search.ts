// Hybrid search fuses semantic and BM25 candidates with RRF, then reranks the shortlist.

import { searchSemantic } from './semantic-search';
import { searchBm25 } from './bm25-search';
import { rerankCandidates } from './cross-rerank';
import { getActiveCrossEncoder } from './cross-encoders/registry';
import { fuseSearchResultsRrf } from './rrf-fusion';
import {
	type ScoredSearchMatch,
	type SearchMatchBase,
	type SearchOptionsBase,
	type SearchResult
} from './search-shared';

const RETRIEVAL_CANDIDATE_MULTIPLIER = 2;
const RERANK_CANDIDATE_MULTIPLIER = 2;

type SearchMethodResults = {
	query: string;
	semantic: SearchMatchBase[];
	bm25: SearchMatchBase[];
	hybrid: SearchMatchBase[];
};

function withoutScore(match: ScoredSearchMatch): SearchMatchBase {
	const { score: _score, ...chunk } = match;
	return chunk;
}

async function collectMethodResults(options: SearchOptionsBase): Promise<{
	query: string;
	semantic: SearchMatchBase[];
	bm25: SearchMatchBase[];
	hybridScored: ScoredSearchMatch[];
}> {
	const query = options.query.trim();
	const topK = Math.max(0, Math.floor(options.topK ?? 10));

	if (!query || topK === 0) {
		return {
			query,
			semantic: [],
			bm25: [],
			hybridScored: []
		};
	}

	const sharedOptions = {
		...options,
		query,
		topK: topK * RETRIEVAL_CANDIDATE_MULTIPLIER
	};

	const [semanticSearch, bm25Search] = await Promise.all([
		searchSemantic(sharedOptions),
		searchBm25(sharedOptions)
	]);

	const fusedCandidates = fuseSearchResultsRrf(semanticSearch.results, bm25Search.results);
	const rrfShortlist = fusedCandidates.slice(0, topK * RERANK_CANDIDATE_MULTIPLIER);
	const matchesByChunkId = new Map(rrfShortlist.map(({ match }) => [match.chunkId, match]));
	const crossEncoder = getActiveCrossEncoder();
	const rerankedCandidates = await rerankCandidates(
		query,
		rrfShortlist.map(({ match }) => ({
			chunkId: match.chunkId,
			content: match.content
		})),
		crossEncoder
	);
	const hybridScored: ScoredSearchMatch[] = [];

	for (const candidate of rerankedCandidates) {
		const match = matchesByChunkId.get(candidate.chunkId);

		if (!match) {
			throw new Error(`${crossEncoder.name} returned an unknown chunk ID: ${candidate.chunkId}`);
		}

		hybridScored.push({
			...match,
			score: candidate.score
		});

		if (hybridScored.length === topK) break;
	}

	return {
		query,
		semantic: semanticSearch.results.slice(0, topK).map(withoutScore),
		bm25: bm25Search.results.slice(0, topK).map(withoutScore),
		hybridScored
	};
}

export async function searchAllMethods(options: SearchOptionsBase): Promise<SearchMethodResults> {
	const search = await collectMethodResults(options);

	return {
		query: search.query,
		semantic: search.semantic,
		bm25: search.bm25,
		hybrid: search.hybridScored.map(withoutScore)
	};
}

export async function searchHybrid(
	options: SearchOptionsBase
): Promise<SearchResult<ScoredSearchMatch>> {
	const search = await collectMethodResults(options);

	return {
		query: search.query,
		results: search.hybridScored
	};
}
