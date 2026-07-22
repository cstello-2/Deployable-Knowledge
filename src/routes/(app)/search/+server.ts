import { json } from '@sveltejs/kit';
import { DEFAULT_ASSISTANT_CONFIG } from '$lib/constants';
import type { RequestHandler } from './$types';
import { toolRegistry } from '$lib/server/tools';

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
		return json({ bm25: [], semantic: [], hybrid: [] });
	}

	const result = await toolRegistry.execute(
		'search',
		{ query, top_k: topK, mode: 'all' },
		{ documentIds: docs, maxSearchTopK: 100 }
	);

	if (result.isError) {
		return json(JSON.parse(result.content), { status: 400 });
	}

	return json(result.data);
};
