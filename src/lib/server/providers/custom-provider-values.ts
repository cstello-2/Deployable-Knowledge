import { error } from '@sveltejs/kit';
import { PROVIDER_NAME_MAX_LENGTH } from '$lib/constants';
import type { CustomProviderRecord } from '$lib/server/database/schema';
import type { ApiCustomProviderRequest, ApiProviderInfo } from '$lib/types';
import { normalizeProviderBaseUrl } from '$lib/utils';

export function toApiProviderInfo(record: CustomProviderRecord): ApiProviderInfo {
	return {
		id: record.id,
		name: record.name,
		custom: { type: record.type, baseUrl: record.baseUrl, hasApiKey: record.apiKey !== '' }
	};
}

export function parseCustomProviderRequest(
	body: ApiCustomProviderRequest
): ApiCustomProviderRequest {
	const name =
		typeof body.name === 'string' ? body.name.trim().slice(0, PROVIDER_NAME_MAX_LENGTH) : '';

	if (!name) {
		throw error(400, 'Provider name is required');
	}

	const baseUrl = typeof body.baseUrl === 'string' ? normalizeProviderBaseUrl(body.baseUrl) : null;

	if (!baseUrl) {
		throw error(400, 'Base URL must be an http or https URL without a query string');
	}

	if (body.apiKey !== null && typeof body.apiKey !== 'string') {
		throw error(400, 'API key must be a string or null');
	}

	return { name, baseUrl, apiKey: body.apiKey?.trim() ?? null };
}
