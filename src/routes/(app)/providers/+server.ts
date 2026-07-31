import { json } from '@sveltejs/kit';

import { db } from '$lib/server/database/database';
import { apiKeys } from '$lib/server/database/schema';
import { getProviders } from '$lib/server/providers/registry';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const available = url.searchParams.get('available') === 'true';
	const savedApiKeyProviderIds = new Set(
		(await db.select({ providerId: apiKeys.providerId }).from(apiKeys)).map((x) => x.providerId)
	);

	let providers = getProviders();

	if (available) {
		providers = providers.filter((x) => !x.apiKeyRequired || savedApiKeyProviderIds.has(x.id));
	}

	return json(
		providers.map((provider) => ({
			id: provider.id,
			name: provider.name,
			apiKeyRequired: provider.apiKeyRequired,
			hasApiKey: savedApiKeyProviderIds.has(provider.id)
		}))
	);
};
