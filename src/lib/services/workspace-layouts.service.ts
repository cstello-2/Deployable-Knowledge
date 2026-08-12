import { API_WORKSPACE_LAYOUTS } from '$lib/constants';
import type {
	ApiReorderRequest,
	ApiWorkspaceLayoutCreateRequest,
	ApiWorkspaceLayoutUpdateRequest,
	WorkspaceLayout,
	WorkspaceLayoutStateResponse
} from '$lib/types';
import { apiDelete, apiFetch, apiPatch, apiPost, type ApiFetchOptions } from '$lib/utils';

export class WorkspaceLayoutsService {
	static list() {
		return apiFetch<WorkspaceLayoutStateResponse>(API_WORKSPACE_LAYOUTS.BASE);
	}

	static create(values: ApiWorkspaceLayoutCreateRequest) {
		return apiPost<WorkspaceLayout, ApiWorkspaceLayoutCreateRequest>(
			API_WORKSPACE_LAYOUTS.BASE,
			values
		);
	}

	// options carries `keepalive` so a pending snapshot can still be flushed while
	// the page is unloading.
	static update(id: string, values: ApiWorkspaceLayoutUpdateRequest, options?: ApiFetchOptions) {
		return apiPatch<WorkspaceLayout, ApiWorkspaceLayoutUpdateRequest>(
			API_WORKSPACE_LAYOUTS.byId(id),
			values,
			options
		);
	}

	static activate(id: string) {
		return apiPost<Pick<WorkspaceLayoutStateResponse, 'activeLayoutId'>, Record<string, never>>(
			API_WORKSPACE_LAYOUTS.activate(id),
			{}
		);
	}

	static reorder(orderedIds: string[]) {
		return apiPost<WorkspaceLayoutStateResponse, ApiReorderRequest>(API_WORKSPACE_LAYOUTS.REORDER, {
			orderedIds
		});
	}

	static delete(id: string) {
		return apiDelete<WorkspaceLayoutStateResponse>(API_WORKSPACE_LAYOUTS.byId(id));
	}
}
