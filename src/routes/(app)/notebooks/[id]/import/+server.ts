import { readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, resolve } from 'node:path';
import { error, json } from '@sveltejs/kit';
import type { ApiNotebookMarkdownImportRequest } from '$lib/types';
import { NOTEBOOK_TEXT_CHARACTER_LIMIT } from '$lib/constants';
import { containsPath } from '$lib/server/documents/remove-document';
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

const MAX_NOTEBOOK_PAGE_BYTES = NOTEBOOK_TEXT_CHARACTER_LIMIT * 4;

export const POST: RequestHandler = async ({ params, request }) => {
	const notebook = await NotebooksRepository.findWithPages(params.id);
	if (!notebook) throw error(404, 'Notebook not found.');

	const body = (await request.json().catch(() => null)) as ApiNotebookMarkdownImportRequest | null;

	if (typeof body?.path !== 'string' || !body.path.trim()) {
		throw error(400, 'Select a Markdown or text file.');
	}

	const homeRoot = await realpath(homedir());
	let filePath: string;
	let fileStats: Awaited<ReturnType<typeof stat>>;

	try {
		filePath = await realpath(resolve(body.path.trim()));
		fileStats = await stat(filePath);
	} catch {
		throw error(400, 'The selected file does not exist or cannot be read.');
	}

	if (!containsPath(homeRoot, filePath) || !fileStats.isFile()) {
		throw error(403, 'Select a Markdown or text file inside your home folder.');
	}

	if (!isNotebookPageImportPath(filePath)) {
		throw error(415, 'Only Markdown and text files are supported.');
	}

	if (fileStats.size === 0) {
		throw error(400, 'The selected file is empty.');
	}

	if (fileStats.size > MAX_NOTEBOOK_PAGE_BYTES) {
		throw error(413, 'The selected file is too large.');
	}

	const content = parseNotebookPageContent(filePath, await readFile(filePath, 'utf8'));
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

	const title = basename(filePath, extname(filePath)).trim() || 'Imported page';

	await NotebooksRepository.createPage(notebook.id, title, content);
	await setActiveNotebook(notebook.id);

	return json(await loadNotebookState(), { status: 201 });
};
