import { error, json } from '@sveltejs/kit';
import type { ApiDocumentListQuery, DocumentListMode, DocumentSortMode } from '$lib/types';
import { DocumentsRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

const MAX_PAGE_SIZE = 200;
const MODES: DocumentListMode[] = ['all', 'active', 'inactive'];
const SORTS: DocumentSortMode[] = [
	'title-asc',
	'title-desc',
	'oldest',
	'newest',
	'most-chunks',
	'least-chunks'
];

function parseCount(value: string | null, name: string, maximum: number): number | undefined {
	if (value === null) return undefined;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum) {
		throw error(400, `The ${name} parameter must be an integer between 0 and ${maximum}.`);
	}
	return parsed;
}

export const GET: RequestHandler = async ({ url }) => {
	const mode = url.searchParams.get('mode') ?? 'all';
	if (!MODES.includes(mode as DocumentListMode)) {
		throw error(400, 'Unsupported document list mode.');
	}
	const sort = url.searchParams.get('sort') ?? 'newest';
	if (!SORTS.includes(sort as DocumentSortMode))
		throw error(400, 'Unsupported document sort mode.');

	const query: ApiDocumentListQuery = {
		limit: parseCount(url.searchParams.get('limit'), 'limit', MAX_PAGE_SIZE),
		mode: mode as DocumentListMode,
		offset: parseCount(url.searchParams.get('offset'), 'offset', Number.MAX_SAFE_INTEGER),
		query: url.searchParams.get('q') ?? undefined,
		sort: sort as DocumentSortMode,
		tags: url.searchParams.getAll('tag')
	};
	return json(await DocumentsRepository.list(query));
};
