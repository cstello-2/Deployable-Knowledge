export const DOCUMENT_TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function normalizeDocumentTag(value: string): string {
	return value.trim().replace(/^#/, '').toLowerCase();
}

export function documentTagHue(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % 360;
}
