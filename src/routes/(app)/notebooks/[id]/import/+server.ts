import { basename, extname } from 'node:path';
import { error, json } from '@sveltejs/kit';
import type { ApiNotebookPageImportRequest } from '$lib/types';
import { NOTEBOOK_TEXT_CHARACTER_LIMIT } from '$lib/constants';
import {
	isNotebookPageImportPath,
	parseNotebookPageContent
} from '$lib/server/notebooks/import-notebook-page';
import {
	loadNotebookState,
	setActiveNotebook,
	NotebooksRepository
} from '$lib/server/repositories/notebooks.repository';
import { countNotebookText } from '$lib/utils/notebook-text';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const notebook = await NotebooksRepository.findWithPages(params.id);
	if (!notebook) throw error(404, 'Notebook not found.');

	const body = (await request.json().catch(() => null)) as ApiNotebookPageImportRequest | null;

	if (typeof body?.name !== 'string' || !body.name.trim() || typeof body?.content !== 'string') {
		throw error(400, 'Select a Markdown or text file.');
	}

	const name = body.name.trim();
	if (!isNotebookPageImportPath(name)) {
		throw error(415, 'Only Markdown and text files are supported.');
	}

	if (!body.content.length) {
		throw error(400, 'The selected file is empty.');
	}

	if (body.content.length > NOTEBOOK_TEXT_CHARACTER_LIMIT) {
		throw error(413, 'The selected file is too large.');
	}

	const content = parseNotebookPageContent(name, body.content);
	if (!content.trim()) {
		throw error(400, 'The selected file contains no text.');
	}

	const characterCount = countNotebookText(notebook.pages) + content.length;
	if (characterCount > NOTEBOOK_TEXT_CHARACTER_LIMIT) {
		throw error(
			413,
			`Notebook text is limited to ${NOTEBOOK_TEXT_CHARACTER_LIMIT.toLocaleString()} characters.`
		);
	}

	const title = basename(name, extname(name)).trim() || 'Imported page';

	await NotebooksRepository.createPage(notebook.id, title, content);
	await setActiveNotebook(notebook.id);

	return json(await loadNotebookState(), { status: 201 });
};
