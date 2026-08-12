import { error, json } from '@sveltejs/kit';

import { setActiveLayoutId } from '$lib/server/database/app-state';
import { WorkspaceLayoutsRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const layout = await WorkspaceLayoutsRepository.find(params.id);

	if (!layout) {
		throw error(404, 'Layout not found');
	}

	await setActiveLayoutId(layout.id);

	return json({ activeLayoutId: layout.id });
};
