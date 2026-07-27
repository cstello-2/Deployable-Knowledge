import type { AssistantProfile } from '$lib/types';

export function profileDisplayName(profile: Pick<AssistantProfile, 'name' | 'model'>): string {
	return profile.name.trim() || profile.model;
}
