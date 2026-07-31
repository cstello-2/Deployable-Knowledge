import { readFile } from 'node:fs/promises';
import { RAG_CHUNK_CHARACTER_LIMIT } from '$lib/constants';
import type { ExtractedChunk, ExtractionResult, Source } from './parse-shared';

export function parseCsv(text: string): string[][] {
	const input = text.replace(/^\uFEFF/, '');
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;

	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];

		if (inQuotes) {
			if (char === '"') {
				if (input[index + 1] === '"') {
					field += '"';
					index += 1;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
		} else if (char === '"') {
			inQuotes = true;
		} else if (char === ',') {
			row.push(field);
			field = '';
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && input[index + 1] === '\n') index += 1;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else {
			field += char;
		}
	}

	if (field !== '' || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	return rows;
}

export function rowsToTablePages(
	source: Source,
	rows: string[][],
	pageIndex: number,
	sheetLabel?: string
): ExtractedChunk[] {
	const lines = rows.map((cells) =>
		cells.map((cell) => cell.replace(/\s+/g, ' ').trim()).join(' | ')
	);
	if (!lines.some((line) => line.replaceAll('|', '').trim())) return [];

	const prefix = sheetLabel ? `Sheet: ${sheetLabel}\n` : '';
	const header = lines[0];
	const baseLength = prefix.length + header.length + 1;
	const chunks: ExtractedChunk[] = [];
	let group: string[] = [];
	let groupLength = 0;

	const flush = () => {
		if (group.length === 0) return;
		chunks.push({
			chunkType: 'TABLE',
			source,
			pageIndex,
			content: `${prefix}${header}\n${group.join('\n')}`
		});
		group = [];
		groupLength = 0;
	};

	for (const line of lines.slice(1)) {
		const lineLength = line.length + 1;
		if (group.length > 0 && baseLength + groupLength + lineLength > RAG_CHUNK_CHARACTER_LIMIT) {
			flush();
		}
		group.push(line);
		groupLength += lineLength;
	}
	flush();

	if (chunks.length === 0) {
		chunks.push({ chunkType: 'TABLE', source, pageIndex, content: `${prefix}${header}` });
	}

	return chunks;
}

export async function extractCsv(source: Source): Promise<ExtractionResult> {
	const rows = parseCsv(await readFile(source.path, 'utf8'));
	const chunks = rowsToTablePages(source, rows, 0);
	return { chunks, pageCount: chunks.length > 0 ? 1 : 0 };
}
