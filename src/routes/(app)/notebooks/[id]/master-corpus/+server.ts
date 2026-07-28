import { json, type RequestHandler } from '@sveltejs/kit';
import { storeNotebookInMasterCorpus } from '$lib/server/notebooks/master-corpus';
import { NotebooksRepository } from '$lib/server/repositories';

export const POST: RequestHandler = async ({ params, request }) => {
	const notebookId = params.id;
	if (!notebookId) return json({ error: 'Missing notebook id' }, { status: 400 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON' }, { status: 400 });
	}

	if (
		typeof body !== 'object' ||
		body === null ||
		!('pageIds' in body) ||
		!Array.isArray(body.pageIds) ||
		!body.pageIds.length ||
		body.pageIds.some((id) => typeof id !== 'string' || !id.trim())
	) {
		return json({ error: 'Select at least one valid notebook page' }, { status: 400 });
	}

	const input = await NotebooksRepository.loadCorpusInput(notebookId, body.pageIds);
	if (!input) return json({ error: 'Notebook not found' }, { status: 404 });
	if (!input.pages.length) {
		return json({ error: 'No selected pages belong to this notebook' }, { status: 400 });
	}

	try {
		return json(await storeNotebookInMasterCorpus(input));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Master Corpus export failed';
		return json({ error: message }, { status: message.startsWith('Select at least') ? 400 : 500 });
	}
};
