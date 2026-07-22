import { API_PROVIDERS } from '$lib/constants';
import type { ApiProviderApiKeyRequest, ApiProviderInfo, ApiProviderModelGroup } from '$lib/types';
import { apiDelete, apiFetch, apiPatch } from '$lib/utils';

export class ProvidersService {
	static list(availableOnly = false) {
		const query = availableOnly ? '?available=true' : '';
		return apiFetch<ApiProviderInfo[]>(`${API_PROVIDERS.BASE}${query}`);
	}

	static listModels(id: string, availableOnly = false) {
		const query = availableOnly ? '?available=true' : '';
		return apiFetch<string[]>(`${API_PROVIDERS.byId(id)}${query}`);
	}

	static async listModelGroups(availableOnly = true): Promise<ApiProviderModelGroup[]> {
		const providers = await this.list(availableOnly);
		return Promise.all(
			providers.map(async ({ id, name }) => ({
				id,
				name,
				models: await this.listModels(id, availableOnly).catch(() => [])
			}))
		);
	}

	static saveApiKey(id: string, apiKey: string) {
		return apiPatch<{ providerId: string; hasApiKey: boolean }, ApiProviderApiKeyRequest>(
			API_PROVIDERS.byId(id),
			{ apiKey }
		);
	}

	static deleteApiKey(id: string) {
		return apiDelete<{ providerId: string; hasApiKey: boolean }>(API_PROVIDERS.byId(id));
	}
}
