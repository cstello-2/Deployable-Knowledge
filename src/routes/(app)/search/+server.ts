import { json } from '@sveltejs/kit';
import { DEFAULT_ASSISTANT_CONFIG } from '$lib/constants';
import { RetrievalMode } from '$lib/enums';
import { diagnosticEvents } from '$lib/server/diagnostics/events';
import { RetrievalFeedbackRepository } from '$lib/server/repositories';
import { toolRegistry } from '$lib/server/tools';
import type { ApiSearchMatch, ApiSearchResults } from '$lib/types';
import type { RequestHandler } from './$types';

type UnratedSearchMatch = Omit<ApiSearchMatch, 'rating'>;

type SearchAllData = Record<RetrievalMode, UnratedSearchMatch[]> & {
	query: string;
};

function attachRatings(
	matches: UnratedSearchMatch[],
	ratings: ReadonlyMap<string, ApiSearchMatch['rating']>
): ApiSearchMatch[] {
	return matches.map((match) => ({
		...match,
		rating: ratings.get(match.chunkId) ?? null
	}));
}

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('query') ?? '';
	const requestedTopK = Number.parseInt(
		url.searchParams.get('topK') ?? String(DEFAULT_ASSISTANT_CONFIG.ragTopK),
		10
	);
	const topK = Number.isFinite(requestedTopK)
		? Math.max(1, requestedTopK)
		: DEFAULT_ASSISTANT_CONFIG.ragTopK;
	const documentIds = url.searchParams.getAll('documentIds');
	const docs = documentIds.length ? documentIds : undefined;

	if (!query.trim()) {
		return json({ bm25: [], semantic: [], hybrid: [] } satisfies ApiSearchResults);
	}

	const started = Date.now();
	const result = await toolRegistry.execute(
		'search',
		{ query, top_k: topK, searchType: 'all' },
		{ documentIds: docs, maxSearchTopK: 100 }
	);

	if (result.isError) {
		diagnosticEvents.searchFailed('all');
		return json(JSON.parse(result.content), { status: 400 });
	}

	const data = result.data as SearchAllData | undefined;
	if (!data) {
		diagnosticEvents.searchFailed('all');
		return json({ error: 'Search returned no result data.' }, { status: 500 });
	}

	const chunkIds = [...data.semantic, ...data.bm25, ...data.hybrid].map(({ chunkId }) => chunkId);
	const ratings = await RetrievalFeedbackRepository.findRatings(query, chunkIds);
	const response: ApiSearchResults = {
		[RetrievalMode.SEMANTIC]: attachRatings(data.semantic, ratings),
		[RetrievalMode.BM25]: attachRatings(data.bm25, ratings),
		[RetrievalMode.HYBRID]: attachRatings(data.hybrid, ratings)
	};

	diagnosticEvents.searchCompleted({
		durationMs: Date.now() - started,
		resultCount: result.outputs?.length ?? 0,
		searchMode: 'all'
	});

	return json(response);
};
