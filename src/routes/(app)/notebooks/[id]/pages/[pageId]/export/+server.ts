import { error } from '@sveltejs/kit';
import {
	notebookPageMarkdown,
	notebookPageMarkdownFilename
} from '$lib/server/notebooks/export-notebook';
import { NotebooksRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const notebook = await NotebooksRepository.findWithPages(params.id);
	if (!notebook) throw error(404, 'Notebook not found.');

	const page = notebook.pages.find(({ id }) => id === params.pageId);
	if (!page) throw error(404, 'Notebook page not found.');

	return new Response(notebookPageMarkdown(page), {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Disposition': `attachment; filename="${notebookPageMarkdownFilename(page.title)}"`,
			'Content-Type': 'text/markdown; charset=utf-8'
		}
	});
};
