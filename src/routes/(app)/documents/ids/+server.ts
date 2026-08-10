import { error, json } from '@sveltejs/kit';
import type { ApiDocumentListQuery, DocumentListMode } from '$lib/types';
import { DocumentsRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

const MODES: DocumentListMode[] = ['all', 'active', 'inactive'];

export const GET: RequestHandler = async ({ url }) => {
	const mode = url.searchParams.get('mode') ?? 'all';
	if (!MODES.includes(mode as DocumentListMode)) {
		throw error(400, 'Unsupported document list mode.');
	}

	const query: ApiDocumentListQuery = {
		mode: mode as DocumentListMode,
		query: url.searchParams.get('q') ?? undefined,
		tags: url.searchParams.getAll('tag')
	};

	const groupValue = url.searchParams.get('group');
	const group =
		groupValue === null
			? undefined
			: groupValue === 'manual'
				? ('manual' as const)
				: { folderId: groupValue === 'individual' ? null : groupValue };

	return json({ ids: await DocumentsRepository.listIds(query, group) });
};
