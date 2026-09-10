import { error, json } from '@sveltejs/kit';

import type { ApiCustomProviderRequest } from '$lib/types';
import {
	parseCustomProviderRequest,
	toApiProviderInfo
} from '$lib/server/providers/custom-provider-values';
import { findProvider } from '$lib/server/providers/registry';
import { CustomProvidersRepository } from '$lib/server/repositories';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const provider = await findProvider(params.id);
	const availableOnly = url.searchParams.get('available') === 'true';

	if (!provider) {
		throw error(404, 'Provider not found');
	}

	try {
		return json(await provider.listModels());
	} catch (cause) {
		if (availableOnly) return json([]);

		const message = cause instanceof Error ? cause.message : String(cause);
		throw error(502, message);
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = (await request.json()) as ApiCustomProviderRequest;
	const { name, baseUrl, apiKey } = parseCustomProviderRequest(body);
	const record = await CustomProvidersRepository.update(params.id, {
		name,
		baseUrl,
		...(apiKey === null ? {} : { apiKey })
	});

	if (!record) {
		throw error(404, 'Provider not found');
	}

	return json(toApiProviderInfo(record));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const record = await CustomProvidersRepository.delete(params.id);

	if (!record) {
		throw error(404, 'Provider not found');
	}

	return json(toApiProviderInfo(record));
};
