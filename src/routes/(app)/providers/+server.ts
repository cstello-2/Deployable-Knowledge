import { error, json } from '@sveltejs/kit';

import { CUSTOM_PROVIDER_TYPES } from '$lib/constants';
import type { ApiCustomProviderCreateRequest, ApiProviderInfo } from '$lib/types';
import {
	parseCustomProviderRequest,
	toApiProviderInfo
} from '$lib/server/providers/custom-provider-values';
import { listBuiltInProviders } from '$lib/server/providers/registry';
import { CustomProvidersRepository } from '$lib/server/repositories';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const builtIn: ApiProviderInfo[] = listBuiltInProviders().map(({ id, name }) => ({
		id,
		name,
		custom: null
	}));
	const custom = (await CustomProvidersRepository.list()).map(toApiProviderInfo);

	return json([...builtIn, ...custom]);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as ApiCustomProviderCreateRequest;

	if (!CUSTOM_PROVIDER_TYPES.includes(body.type)) {
		throw error(400, 'Unknown provider type');
	}

	const { name, baseUrl, apiKey } = parseCustomProviderRequest(body);
	const record = await CustomProvidersRepository.create({
		type: body.type,
		name,
		baseUrl,
		apiKey: apiKey ?? ''
	});

	return json(toApiProviderInfo(record), { status: 201 });
};
