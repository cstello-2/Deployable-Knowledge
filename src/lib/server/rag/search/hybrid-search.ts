// Hybrid search gathers semantic and BM25 candidates, then reranks them together.

import { searchSemantic } from './semantic-search';
import { searchBm25 } from './bm25-search';
import { rerankCandidates } from './cross-rerank';
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
		return { query, semantic: [], bm25: [], hybridScored: [] };
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
	const semantic = semanticSearch.results.map(withoutScore);
	const bm25 = bm25Search.results.map(withoutScore);
	const byChunkId = new Map<string, SearchMatchBase>();

	for (const match of [...semantic, ...bm25]) {
		if (!byChunkId.has(match.chunkId)) {
			byChunkId.set(match.chunkId, match);
		}
	}

	const rankedCandidates = await rerankCandidates(
		query,
		[...byChunkId.values()].map((match) => ({
			chunkId: match.chunkId,
			content: match.content
		}))
	);
	const hybridScored: ScoredSearchMatch[] = [];

	for (const candidate of rankedCandidates) {
		const match = byChunkId.get(candidate.chunkId);
		if (match) hybridScored.push({ ...match, score: candidate.relevance });
		if (hybridScored.length === topK) break;
	}

	return {
		query,
		semantic: semantic.slice(0, topK),
		bm25: bm25.slice(0, topK),
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
