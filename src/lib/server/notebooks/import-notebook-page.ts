import { extname } from 'node:path';

const MARKDOWN_EXTENSION = '.md';
const PLAIN_TEXT_EXTENSION = '.txt';

export function isNotebookPageImportPath(path: string): boolean {
	const extension = extname(path).toLowerCase();
	return extension === MARKDOWN_EXTENSION || extension === PLAIN_TEXT_EXTENSION;
}

export function parseNotebookPageContent(sourceName: string, sourceText: string): string {
	const normalized = sourceText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	if (extname(sourceName).toLowerCase() !== PLAIN_TEXT_EXTENSION) return normalized;

	const lines = normalized.split('\n').map((line) => line.trimEnd());

	return lines
		.map((line, index) => {
			const nextLine = lines[index + 1];
			return line && nextLine?.trim() ? `${line}  ` : line;
		})
		.join('\n');
}
