// Hybrid search gathers semantic and BM25 candidates, then reranks them together.

import { searchSemantic } from './semantic-search';
import { searchBm25 } from './bm25-search';
import { rerankCandidates } from './cross-rerank';
import { feedbackCandidateLimit, rerankWithRetrievalFeedback } from './feedback-rerank';
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
	semanticScored: ScoredSearchMatch[];
	bm25Scored: ScoredSearchMatch[];
	hybridScored: ScoredSearchMatch[];
}> {
	const query = options.query.trim();
	const topK = Math.max(0, Math.floor(options.topK ?? 10));

	if (!query || topK === 0) {
		return { query, semanticScored: [], bm25Scored: [], hybridScored: [] };
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
	const semanticScored = semanticSearch.results.slice(0, topK);
	const bm25Scored = bm25Search.results.slice(0, topK);
	const semantic = semanticScored.map(withoutScore);
	const bm25 = bm25Scored.map(withoutScore);
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
		semanticScored,
		bm25Scored,
		hybridScored
	};
}

export async function searchAllMethods(options: SearchOptionsBase): Promise<SearchMethodResults> {
	const topK = Math.max(0, Math.floor(options.topK ?? 10));
	const search = await collectMethodResults({
		...options,
		topK: feedbackCandidateLimit(topK)
	});
	const [semantic, bm25, hybrid] = await Promise.all([
		rerankWithRetrievalFeedback(search.query, search.semanticScored, topK),
		rerankWithRetrievalFeedback(search.query, search.bm25Scored, topK),
		rerankWithRetrievalFeedback(search.query, search.hybridScored, topK)
	]);

	return {
		query: search.query,
		semantic: semantic.map(withoutScore),
		bm25: bm25.map(withoutScore),
		hybrid: hybrid.map(withoutScore)
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
