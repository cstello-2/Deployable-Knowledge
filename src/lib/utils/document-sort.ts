import type { DocumentSortMode } from '$lib/types';

export type { DocumentSortMode };

export const DOCUMENT_SORT_OPTIONS: readonly { value: DocumentSortMode; label: string }[] = [
	{ value: 'title-asc', label: 'A → Z' },
	{ value: 'title-desc', label: 'Z → A' },
	{ value: 'newest', label: 'Newest' },
	{ value: 'oldest', label: 'Oldest' },
	{ value: 'most-chunks', label: 'Most chunks' },
	{ value: 'least-chunks', label: 'Least chunks' }
];

export const DEFAULT_DOCUMENT_SORT: DocumentSortMode = 'newest';
