import { error, json } from '@sveltejs/kit';

import { WorkspaceLayoutsRepository } from '$lib/server/repositories';
import { parseReorderRequest } from '$lib/server/utils/reorder';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = parseReorderRequest(await request.json().catch(() => null));

	if (!body) {
		throw error(400, 'A unique list of layout ids is required');
	}
	if (!(await WorkspaceLayoutsRepository.reorder(body.orderedIds))) {
		throw error(409, 'The layout order no longer matches the stored layouts');
	}

	return json(await WorkspaceLayoutsRepository.loadState());
};
