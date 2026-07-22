import { API_PROMPT_TEMPLATES } from '$lib/constants';
import type { ApiPromptTemplateRequest, PromptTemplate } from '$lib/types';
import { apiDelete, apiFetch, apiPatch, apiPost } from '$lib/utils';

export class PromptTemplatesService {
	static list() {
		return apiFetch<PromptTemplate[]>(API_PROMPT_TEMPLATES.BASE);
	}

	static create(value: ApiPromptTemplateRequest) {
		return apiPost<PromptTemplate, ApiPromptTemplateRequest>(API_PROMPT_TEMPLATES.BASE, value);
	}

	static update(id: string, value: ApiPromptTemplateRequest) {
		return apiPatch<PromptTemplate, ApiPromptTemplateRequest>(API_PROMPT_TEMPLATES.byId(id), value);
	}

	static delete(id: string) {
		return apiDelete<PromptTemplate>(API_PROMPT_TEMPLATES.byId(id));
	}
}
