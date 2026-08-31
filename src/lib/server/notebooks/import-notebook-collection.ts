import { extname } from 'node:path';
import { NOTEBOOK_TEXT_CHARACTER_LIMIT } from '$lib/constants';
import { parseNotebookPageContent } from '$lib/server/notebooks/import-notebook-page';

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

export interface ImportedNotebookFile {
	sourceName: string;
	data: Buffer;
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

export function buildNotebookCollection(
	title: string,
	files: ImportedNotebookFile[]
): ImportedNotebookCollection {
	if (files.length > MAX_PAGE_COUNT) {
		throw new NotebookCollectionImportError(
			`A notebook can import at most ${MAX_PAGE_COUNT} pages.`,
			413
		);
	}

	const totalBytes = files.reduce((total, file) => total + file.data.length, 0);
	if (totalBytes > MAX_COLLECTION_BYTES) {
		throw new NotebookCollectionImportError('The notebook collection is too large.', 413);
	}

	const sorted = [...files].sort((left, right) =>
		left.sourceName.localeCompare(right.sourceName, undefined, {
			numeric: true,
			sensitivity: 'base'
		})
	);

	const pages = sorted.map((file) => ({
		content: importedPageContent(file.data, file.sourceName),
		title: pageTitle(file.sourceName)
	}));

	validatePages(pages);

	return {
		pages,
		title: title.trim() || 'Imported notebook'
	};
}
