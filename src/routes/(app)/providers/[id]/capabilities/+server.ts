import { json } from '@sveltejs/kit';
import { findProvider } from '$lib/server/providers/registry';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const model = url.searchParams.get('model')?.trim() ?? '';

	if (!model) {
		return json({ error: 'model query parameter is required' }, { status: 400 });
	}

	const provider = await findProvider(params.id);

	if (!provider) {
		return json({ error: `Unknown provider: ${params.id}` }, { status: 404 });
	}

	const tools = await provider.supportsTools(model);

	return json({ model, tools });
};
