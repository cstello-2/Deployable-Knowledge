import { json, type RequestHandler } from '@sveltejs/kit';
import type { ApiReorderResponse } from '$lib/types';
import { parseReorderRequest } from '$lib/server/notebooks/notebook-order';
import { NotebooksRepository } from '$lib/server/repositories/notebooks.repository';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const notebookId = params.id;
	if (!notebookId) return json({ error: 'Missing notebook id' }, { status: 400 });

	const body = parseReorderRequest(await request.json().catch(() => null));
	if (!body) return json({ error: 'Invalid page order' }, { status: 400 });

	if (!(await NotebooksRepository.reorderPages(notebookId, body.orderedIds))) {
		return json({ error: 'Page order is out of date' }, { status: 409 });
	}

	return json({ ok: true } satisfies ApiReorderResponse);
};
