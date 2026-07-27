import { API_SEARCH } from '$lib/constants';
import type { ApiSearchResults } from '$lib/types';
import { apiFetch } from '$lib/utils';

export class SearchService {
	static search(query: string, topK: number, documentIds: readonly string[] = []) {
		const params = new URLSearchParams({ query, topK: String(topK) });
		for (const id of documentIds) params.append('documentIds', id);
		return apiFetch<ApiSearchResults>(`${API_SEARCH}?${params}`);
	}
}
