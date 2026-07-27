import { error } from '@sveltejs/kit';
import { notebookMarkdown, notebookMarkdownFilename } from '$lib/server/notebooks/export-notebook';
import { NotebooksRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const notebook = await NotebooksRepository.findWithPages(params.id);
	if (!notebook) throw error(404, 'Notebook not found.');

	return new Response(notebookMarkdown(notebook), {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Disposition': `attachment; filename="${notebookMarkdownFilename(notebook.title)}"`,
			'Content-Type': 'text/markdown; charset=utf-8'
		}
	});
};
