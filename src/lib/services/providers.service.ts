import { API_PROVIDERS } from '$lib/constants';
import type {
	ApiCustomProviderCreateRequest,
	ApiCustomProviderRequest,
	ApiProviderInfo,
	ApiProviderModelCapabilities,
	ApiProviderModelGroup
} from '$lib/types';
import { apiDelete, apiFetch, apiPatch, apiPost } from '$lib/utils';

export class ProvidersService {
	static list() {
		return apiFetch<ApiProviderInfo[]>(API_PROVIDERS.BASE);
	}

	static listModels(id: string, availableOnly = false) {
		const query = availableOnly ? '?available=true' : '';
		return apiFetch<string[]>(`${API_PROVIDERS.byId(id)}${query}`);
	}

	static async listModelGroups(availableOnly = true): Promise<ApiProviderModelGroup[]> {
		const providers = await this.list();
		return Promise.all(
			providers.map(async (provider) => ({
				...provider,
				models: await this.listModels(provider.id, availableOnly).catch(() => [])
			}))
		);
	}

	static getModelCapabilities(id: string, model: string) {
		return apiFetch<ApiProviderModelCapabilities>(API_PROVIDERS.capabilities(id, model));
	}

	static create(value: ApiCustomProviderCreateRequest) {
		return apiPost<ApiProviderInfo, ApiCustomProviderCreateRequest>(API_PROVIDERS.BASE, value);
	}

	static update(id: string, value: ApiCustomProviderRequest) {
		return apiPatch<ApiProviderInfo, ApiCustomProviderRequest>(API_PROVIDERS.byId(id), value);
	}

	static delete(id: string) {
		return apiDelete<ApiProviderInfo>(API_PROVIDERS.byId(id));
	}
}
