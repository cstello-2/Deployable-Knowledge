import { API_TOOLS } from '$lib/constants';
import type { ApiAgentTool } from '$lib/types';
import { apiFetch } from '$lib/utils';

export class ToolsService {
	static list() {
		return apiFetch<ApiAgentTool[]>(API_TOOLS);
	}
}
