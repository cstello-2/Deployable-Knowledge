import { json } from '@sveltejs/kit';
import { getProvider } from '$lib/server/providers/registry';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const model = url.searchParams.get('model')?.trim() ?? '';

	if (!model) {
		return json({ error: 'model query parameter is required' }, { status: 400 });
	}

	let provider;
	try {
		provider = getProvider(params.id);
	} catch {
		return json({ error: `Unknown provider: ${params.id}` }, { status: 404 });
	}

	const tools = await provider.supportsTools(model);

	return json({ model, tools });
};
