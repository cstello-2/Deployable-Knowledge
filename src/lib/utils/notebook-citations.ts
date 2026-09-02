import { APP_PREVIEW } from '$lib/constants';
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
	const href = APP_PREVIEW.page(source.documentId, source.pageIndex);
	const citation = `([${title}, p. ${page}](${href}))`;
	const start = clamp(selectionStart, 0, text.length);
	const end = clamp(selectionEnd, start, text.length);
	const before = text.slice(0, start);
	const after = text.slice(end);
	const prefix = before && !/[\s([{]$/.test(before) ? ' ' : '';
	const suffix = after && !/^[\s.,;:!?)}\]]/.test(after) ? ' ' : '';
	const insertion = `${prefix}${citation}${suffix}`;
	return {
		text: `${before}${insertion}${after}`,
		cursor: before.length + insertion.length
	};
}

export function insertNotebookCitationsTable(
	text: string,
	sources: readonly NotebookSourceItem[]
): string {
	const rows = extractRows(text);
	for (const source of sources) {
		const row = tableRow(source);
		if (!rows.includes(row)) rows.push(row);
	}
	if (!rows.length) return text;
	const body = removeTable(text).trimEnd();
	return `${body}\n\n${TABLE_HEADER}\n${rows.join('\n')}`;
}

export function notebookSourceHeading(title: string, href: string, location: string): string {
	return `**[${escapeLabel(title.trim() || 'Source')}](${href})** — ${location}`;
}

function tableRow(source: NotebookSourceItem): string {
	const href = APP_PREVIEW.page(source.documentId, source.pageIndex);
	return `| [${escapeTable(source.documentTitle)}](${href}) | ${source.pageIndex + 1} |`;
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
