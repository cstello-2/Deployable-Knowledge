import type { DocumentRow } from '$lib/types';

// greedy in-order character match; density rewards tighter matches so
// "rpt" scores higher against "report" than against "råpporteringstid"
function subsequenceScore(token: string, field: string): number {
	if (field.includes(token)) return 1;
	let position = 0;
	for (const char of token) {
		const found = field.indexOf(char, position);
		if (found === -1) return 0;
		position = found + 1;
	}
	// all chars matched in order but not contiguously - scale by how
	// spread out the match ended up, capped below an exact substring hit
	return Math.min(0.9, token.length / position);
}

function bestFieldScore(token: string, fields: readonly string[]): number {
	let best = 0;
	for (const field of fields) {
		best = Math.max(best, subsequenceScore(token, field));
		if (best === 1) break;
	}
	return best;
}

// score in [0, 1] for how well a document matches the filter query,
// fuzzy-matched against the title and tags. 0 means no match at all.
export function fuzzyDocumentScore(query: string, document: DocumentRow): number {
	const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (!tokens.length) return 1;
	const fields = [document.title || document.id, ...document.tags].map((field) =>
		field.toLowerCase()
	);
	let total = 0;
	for (const token of tokens) total += bestFieldScore(token, fields);
	return total / tokens.length;
}
