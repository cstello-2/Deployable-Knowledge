import type { DocumentRow } from '$lib/types';

export type DocumentSortMode =
	| 'title-asc'
	| 'title-desc'
	| 'oldest'
	| 'newest'
	| 'most-chunks'
	| 'least-chunks';

export const DOCUMENT_SORT_OPTIONS: readonly { value: DocumentSortMode; label: string }[] = [
	{ value: 'title-asc', label: 'A → Z' },
	{ value: 'title-desc', label: 'Z → A' },
	{ value: 'newest', label: 'Newest' },
	{ value: 'oldest', label: 'Oldest' },
	{ value: 'most-chunks', label: 'Most chunks' },
	{ value: 'least-chunks', label: 'Least chunks' }
];

// fall back to the id if a doc somehow has no title, just so sorting
// doesn't blow up on an empty string
function titleOf(document: DocumentRow): string {
	return (document.title || document.id).toLowerCase();
}

// returns a new sorted array, doesn't touch the one you passed in
export function sortDocuments(
	documents: readonly DocumentRow[],
	mode: DocumentSortMode
): DocumentRow[] {
	const sorted = [...documents];
	switch (mode) {
		case 'title-asc':
			return sorted.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
		case 'title-desc':
			return sorted.sort((a, b) => titleOf(b).localeCompare(titleOf(a)));
		case 'oldest':
			return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		case 'newest':
			return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		case 'most-chunks':
			return sorted.sort((a, b) => b.chunkCount - a.chunkCount);
		case 'least-chunks':
			return sorted.sort((a, b) => a.chunkCount - b.chunkCount);
	}
}
