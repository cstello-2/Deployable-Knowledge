import { json } from '@sveltejs/kit';
import { DEFAULT_ASSISTANT_CONFIG } from '$lib/constants';
import type { RequestHandler } from './$types';
import { toolRegistry } from '$lib/server/tools';
import { RetrievalMode } from '$lib/enums';
import { retrieveRagContext } from '$lib/server/rag/search/retrieve-rag-context';
import type { ApiSearchMatch, ApiSearchResults } from '$lib/types';

function emptyResults(): ApiSearchResults {
	return {
		bm25: [],
		semantic: [],
		hybrid: [],
		graph: []
	};
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
		return json(emptyResults());
	}

	const result = await toolRegistry.execute(
		'search',
		{ query, top_k: topK, mode: 'all' },
		{ documentIds: docs, maxSearchTopK: 100 }
	);

	if (result.isError) {
		return json(JSON.parse(result.content), { status: 400 });
	}

	const graph = await retrieveRagContext({
		question: query,
		documentIds: docs,
		topK,
		mode: RetrievalMode.KNOWLEDGE_GRAPH
	});

	const data = result.data as Omit<ApiSearchResults, RetrievalMode.KNOWLEDGE_GRAPH>;
	return json({
		...data,
		graph: graph.sources.map(
			(source): ApiSearchMatch => ({
				chunkId: source.chunkId,
				documentId: source.documentId,
				sourceTitle: source.sourceTitle ?? source.title,
				sourceType: source.sourceType,
				pageIndex: source.pageIndex,
				chunkIndex: source.chunkIndex,
				content: source.content ?? source.description
			})
		)
	});
};
