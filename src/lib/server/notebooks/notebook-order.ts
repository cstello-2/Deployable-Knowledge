import type { ApiReorderRequest } from '$lib/types';

export function parseReorderRequest(value: unknown): ApiReorderRequest | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

	const orderedIds = (value as Record<string, unknown>).orderedIds;
	if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === 'string')) {
		return null;
	}
	if (new Set(orderedIds).size !== orderedIds.length) return null;
	return { orderedIds };
}
