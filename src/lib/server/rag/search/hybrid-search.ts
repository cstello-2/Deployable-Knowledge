// Hybrid search gathers semantic and BM25 candidates, then fuses their rankings with RRF.

import { searchSemantic } from './semantic-search';
import { searchBm25 } from './bm25-search';
import { fuseSearchResultsRrf } from './rrf-fusion';
import {
	type ScoredSearchMatch,
	type SearchMatchBase,
	type SearchOptionsBase,
	type SearchResult
} from './search-shared';

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
		topK: topK * 2
	};

	const [semanticSearch, bm25Search] = await Promise.all([
		searchSemantic(sharedOptions),
		searchBm25(sharedOptions)
	]);

	const fusedCandidates = fuseSearchResultsRrf(semanticSearch.results, bm25Search.results);

	const hybridScored: ScoredSearchMatch[] = fusedCandidates
		.slice(0, topK)
		.map(({ match, score }) => ({
			...match,
			score
		}));

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
