export interface FuzzyDocumentFields {
	id: string;
	tags: string[];
	title: string;
}

export function fuzzyDocumentScore(query: string, document: FuzzyDocumentFields): number {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return 1;
	const title = (document.title || document.id).toLowerCase();
	const haystack = `${title} ${document.tags.join(' ').toLowerCase()}`;
	const index = haystack.indexOf(normalized);
	if (index !== -1) return 2 - index / Math.max(haystack.length, 1);
	let matched = 0;
	for (let i = 0; i < haystack.length && matched < normalized.length; i += 1) {
		if (haystack[i] === normalized[matched]) matched += 1;
	}
	if (matched === normalized.length) return 1.2;
	const tokens = normalized.split(/\s+/).filter(Boolean);
	if (!tokens.length) return 0;
	const chunks = haystack.split(/[\s._\-/]+/).filter(Boolean);
	const hits = tokens.filter((token) =>
		chunks.some((chunk) => chunk.includes(token) || token.includes(chunk))
	).length;
	if (!hits) return 0;
	return 0.3 + (0.6 * hits) / tokens.length;
}
