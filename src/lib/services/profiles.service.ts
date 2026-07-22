import { API_PROFILES } from '$lib/constants';
import type {
	ActiveAssistantProfile,
	AssistantProfile,
	AssistantProfileActivationResponse,
	AssistantProfileCreateValues,
	AssistantProfileListResponse,
	AssistantProfileUpdateValues,
	AssistantProfileValues
} from '$lib/types';
import { apiDelete, apiFetch, apiPatch, apiPost } from '$lib/utils';

export class ProfilesService {
	static list() {
		return apiFetch<AssistantProfileListResponse>(API_PROFILES.BASE);
	}

	static getActive() {
		return apiFetch<ActiveAssistantProfile>(API_PROFILES.ACTIVE);
	}

	static create(values: AssistantProfileCreateValues) {
		return apiPost<AssistantProfile, AssistantProfileCreateValues>(API_PROFILES.BASE, values);
	}

	static activate(id: string) {
		return apiPost<AssistantProfileActivationResponse, Record<string, never>>(
			API_PROFILES.activate(id),
			{}
		);
	}

	static update(id: string, values: AssistantProfileUpdateValues) {
		return apiPatch<AssistantProfile, AssistantProfileUpdateValues>(API_PROFILES.byId(id), values);
	}

	static updateActive(values: AssistantProfileValues) {
		return apiPatch<AssistantProfile, AssistantProfileValues>(API_PROFILES.ACTIVE, values);
	}

	static delete(id: string) {
		return apiDelete<AssistantProfile>(API_PROFILES.byId(id));
	}
}
