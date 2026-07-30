import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, relative, resolve } from 'node:path';
import { NOTEBOOK_TEXT_CHARACTER_LIMIT } from '$lib/constants';
import { containsPath } from '$lib/server/documents/remove-document';
import {
	isNotebookPageImportPath,
	parseNotebookPageContent
} from '$lib/server/notebooks/import-notebook-page';

const MAX_COLLECTION_BYTES = NOTEBOOK_TEXT_CHARACTER_LIMIT * 4;
const MAX_PAGE_COUNT = 100;

export interface ImportedNotebookPage {
	content: string;
	title: string;
}

export interface ImportedNotebookCollection {
	pages: ImportedNotebookPage[];
	title: string;
}

export class NotebookCollectionImportError extends Error {
	constructor(
		message: string,
		public readonly status = 400
	) {
		super(message);
		this.name = 'NotebookCollectionImportError';
	}
}

function normalizedPath(path: string): string {
	return path.replace(/\\/g, '/');
}

function pageTitle(sourceName: string): string {
	const normalized = normalizedPath(sourceName);
	const extension = extname(normalized);
	const title = extension ? normalized.slice(0, -extension.length) : normalized;

	return title.trim() || 'Imported page';
}

function importedPageContent(data: Buffer, label: string): string {
	if (!data.length) {
		throw new NotebookCollectionImportError(`${label} is empty.`);
	}

	if (data.length > MAX_COLLECTION_BYTES) {
		throw new NotebookCollectionImportError(`${label} is too large.`, 413);
	}

	const content = parseNotebookPageContent(label, data.toString('utf8'));

	if (!content.trim()) {
		throw new NotebookCollectionImportError(`${label} contains no text.`);
	}

	return content;
}

function validatePages(pages: ImportedNotebookPage[]): void {
	if (!pages.length) {
		throw new NotebookCollectionImportError('No Markdown or text files were found.');
	}

	if (pages.length > MAX_PAGE_COUNT) {
		throw new NotebookCollectionImportError(
			`A notebook can import at most ${MAX_PAGE_COUNT} pages.`,
			413
		);
	}

	const characterCount = pages.reduce((total, page) => total + page.content.length, 0);

	if (characterCount > NOTEBOOK_TEXT_CHARACTER_LIMIT) {
		throw new NotebookCollectionImportError(
			`Notebook text is limited to ${NOTEBOOK_TEXT_CHARACTER_LIMIT.toLocaleString()} characters.`,
			413
		);
	}
}

async function validatedSourcePath(inputPath: string): Promise<string> {
	const homeRoot = await realpath(homedir());
	let sourcePath: string;

	try {
		sourcePath = await realpath(resolve(inputPath));
	} catch {
		throw new NotebookCollectionImportError('The selected folder does not exist.');
	}

	if (!containsPath(homeRoot, sourcePath)) {
		throw new NotebookCollectionImportError('Select a folder inside your home folder.', 403);
	}

	return sourcePath;
}

async function loadFolder(sourcePath: string): Promise<ImportedNotebookCollection> {
	const entries = await readdir(sourcePath, {
		withFileTypes: true,
		recursive: true
	});

	const files = entries
		.filter((entry) => entry.isFile())
		.map((entry) => resolve(entry.parentPath, entry.name))
		.map((path) => ({
			path,
			sourceName: normalizedPath(relative(sourcePath, path))
		}))
		.filter(({ sourceName }) => isNotebookPageImportPath(sourceName))
		.filter(
			({ sourceName }) =>
				!sourceName.split('/').some((segment) => segment.startsWith('.') || segment === '__MACOSX')
		)
		.sort((left, right) =>
			left.sourceName.localeCompare(right.sourceName, undefined, {
				numeric: true,
				sensitivity: 'base'
			})
		);

	if (files.length > MAX_PAGE_COUNT) {
		throw new NotebookCollectionImportError(
			`A notebook can import at most ${MAX_PAGE_COUNT} pages.`,
			413
		);
	}

	const sizes = await Promise.all(files.map(async ({ path }) => (await stat(path)).size));

	const totalBytes = sizes.reduce((total, size) => total + size, 0);

	if (totalBytes > MAX_COLLECTION_BYTES) {
		throw new NotebookCollectionImportError('The notebook collection is too large.', 413);
	}

	const pages: ImportedNotebookPage[] = [];

	for (const file of files) {
		pages.push({
			content: importedPageContent(await readFile(file.path), file.sourceName),
			title: pageTitle(file.sourceName)
		});
	}

	validatePages(pages);

	return {
		pages,
		title: basename(sourcePath).trim() || 'Imported notebook'
	};
}

export async function loadNotebookCollection(
	inputPath: string
): Promise<ImportedNotebookCollection> {
	if (!inputPath.trim()) {
		throw new NotebookCollectionImportError('Select a folder or ZIP archive.');
	}

	const sourcePath = await validatedSourcePath(inputPath.trim());
	const sourceStats = await stat(sourcePath);

	if (sourceStats.isDirectory()) {
		return loadFolder(sourcePath);
	}

	throw new NotebookCollectionImportError(
		'Select a folder containing Markdown or text files.',
		415
	);
}
