import { API_DOCUMENT_FILES } from '$lib/constants';
import type { NotebookSourceItem } from '$lib/types';

export interface CitationInsertion {
	text: string;
	cursor: number;
}

const TABLE_HEADER = ['## Citations', '', '| Source | Page |', '| --- | ---: |'].join('\n');

export function insertNotebookSourceCitation(
	text: string,
	source: NotebookSourceItem,
	selectionStart = text.length,
	selectionEnd = selectionStart
): CitationInsertion {
	const page = source.pageIndex + 1;
	const title = escapeLabel(source.documentTitle.trim() || 'Source');
	const href = `${API_DOCUMENT_FILES.byId(source.documentId)}#page=${page}`;
	const citation =
		source.sourceType === 'PDF' ? `([${title}, p. ${page}](${href}))` : `(${title}, p. ${page})`;
	const start = clamp(selectionStart, 0, text.length);
	const end = clamp(selectionEnd, start, text.length);
	const before = text.slice(0, start);
	const after = text.slice(end);
	const prefix = before && !/[\s([{]$/.test(before) ? ' ' : '';
	const suffix = after && !/^[\s.,;:!?)}\]]/.test(after) ? ' ' : '';
	const insertion = `${prefix}${citation}${suffix}`;
	const body = `${before}${insertion}${after}`.trimEnd();
	const sourceCell =
		source.sourceType === 'PDF'
			? `[${escapeTable(source.documentTitle)}](${href})`
			: escapeTable(source.documentTitle);
	const row = `| ${sourceCell} | ${page} |`;
	const existingRows = extractRows(body);
	const withoutTable = removeTable(body);
	const rows = existingRows.includes(row) ? existingRows : [...existingRows, row];
	return {
		text: `${withoutTable.trimEnd()}\n\n${TABLE_HEADER}\n${rows.join('\n')}`.trimStart(),
		cursor: before.length + insertion.length
	};
}

function extractRows(text: string): string[] {
	const start = text.lastIndexOf(TABLE_HEADER);
	if (start < 0) return [];
	return text
		.slice(start + TABLE_HEADER.length)
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => /^\|.*\|$/.test(line));
}

function removeTable(text: string): string {
	const start = text.lastIndexOf(TABLE_HEADER);
	return start < 0 ? text : text.slice(0, start);
}

function escapeLabel(value: string): string {
	return value.replace(/([\\[\]])/g, '\\$1');
}

function escapeTable(value: string): string {
	return escapeLabel(value.replace(/\s+/g, ' ').trim()).replace(/\|/g, '\\|');
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
