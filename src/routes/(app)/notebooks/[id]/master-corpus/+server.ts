import { error, json } from '@sveltejs/kit';
import { storeNotebookInMasterCorpus } from '$lib/server/notebooks/master-corpus';
import { NotebooksRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

interface MasterCorpusRequest {
	pageIds?: unknown;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const notebook = await NotebooksRepository.findWithPages(params.id);
	if (!notebook) throw error(404, 'Notebook not found.');

	const body = (await request.json()) as MasterCorpusRequest;
	if (
		!Array.isArray(body.pageIds) ||
		body.pageIds.length === 0 ||
		body.pageIds.some((pageId) => typeof pageId !== 'string')
	) {
		throw error(400, 'Select at least one notebook page.');
	}

	// grab pageIndex before filtering, so it still reflects the page's real
	// position in the notebook and not its index in the filtered subset
	const selectedPageIds = new Set(body.pageIds as string[]);
	const pages = notebook.pages
		.map((page, pageIndex) => ({ ...page, pageIndex }))
		.filter((page) => selectedPageIds.has(page.id));

	if (pages.length === 0) throw error(400, 'Select at least one notebook page.');

	try {
		const result = await storeNotebookInMasterCorpus({
			notebookId: notebook.id,
			notebookTitle: notebook.title,
			pages
		});
		return json(result);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : 'Master Corpus export failed.';
		throw error(message.startsWith('Select at least') ? 400 : 500, message);
	}
};
