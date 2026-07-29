import { json, type RequestHandler } from '@sveltejs/kit';
import type { ApiReorderResponse } from '$lib/types';
import { parseReorderRequest } from '$lib/server/notebooks/notebook-order';
import { NotebooksRepository } from '$lib/server/repositories/notebooks.repository';

export const PATCH: RequestHandler = async ({ request }) => {
	const body = parseReorderRequest(await request.json().catch(() => null));
	if (!body) return json({ error: 'Invalid notebook order' }, { status: 400 });

	if (!(await NotebooksRepository.reorderNotebooks(body.orderedIds))) {
		return json({ error: 'Notebook order is out of date' }, { status: 409 });
	}

	return json({ ok: true } satisfies ApiReorderResponse);
};
