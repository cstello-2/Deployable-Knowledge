import type { DocumentChunk } from '$lib/server/database/schema';

export type TextPreviewSegment = {
	chunkIndexes: number[];
	content: string;
};

type ChunkAnchor = Pick<DocumentChunk, 'chunkIndex' | 'content'>;

type ChunkStart = {
	chunkIndex: number;
	start: number;
};

function chunkStarts(text: string, chunks: readonly ChunkAnchor[]): ChunkStart[] {
	const characters: string[] = [];
	const offsets: number[] = [];

	for (let index = 0; index < text.length; index += 1) {
		if (/\s/.test(text[index])) continue;
		characters.push(text[index]);
		offsets.push(index);
	}

	const dense = characters.join('');
	const starts: ChunkStart[] = [];
	let searchFrom = 0;

	for (const chunk of chunks) {
		const needle = chunk.content.replace(/\s+/g, '');
		if (!needle) continue;

		const found = dense.indexOf(needle, searchFrom);
		if (found < 0) continue;

		starts.push({ chunkIndex: chunk.chunkIndex, start: offsets[found] });
		searchFrom = found + 1;
	}

	return starts;
}

function buildSegments(text: string, starts: ChunkStart[]): TextPreviewSegment[] {
	if (starts.length === 0) return [{ chunkIndexes: [], content: text }];

	const grouped: { start: number; chunkIndexes: number[] }[] = [];

	for (const { chunkIndex, start } of starts) {
		const previous = grouped[grouped.length - 1];

		if (previous && previous.start === start) {
			previous.chunkIndexes.push(chunkIndex);
			continue;
		}

		grouped.push({ start, chunkIndexes: [chunkIndex] });
	}

	const segments: TextPreviewSegment[] = [];

	if (grouped[0].start > 0) {
		segments.push({ chunkIndexes: [], content: text.slice(0, grouped[0].start) });
	}

	for (const [position, group] of grouped.entries()) {
		const end = grouped[position + 1]?.start ?? text.length;
		segments.push({ chunkIndexes: group.chunkIndexes, content: text.slice(group.start, end) });
	}

	return segments;
}

function markdownBlockStarts(text: string): number[] {
	const starts = [0];
	let offset = 0;
	let insideFence = false;
	let previousLineBlank = false;

	for (const line of text.split('\n')) {
		const fenceLine = /^ {0,3}(```|~~~)/.test(line);
		const blank = line.trim() === '';
		const startsBlock =
			offset > 0 &&
			previousLineBlank &&
			!insideFence &&
			!blank &&
			!/^( {4,}|\t)/.test(line) &&
			!/^ {0,3}([-*+]\s|\d+[.)]\s|[|>])/.test(line);

		if (startsBlock) starts.push(offset);

		previousLineBlank = blank && !insideFence;
		if (fenceLine) insideFence = !insideFence;
		offset += line.length + 1;
	}

	return starts;
}

export function splitTextByChunks(
	text: string,
	chunks: readonly ChunkAnchor[]
): TextPreviewSegment[] {
	return buildSegments(text, chunkStarts(text, chunks));
}

export function splitMarkdownByChunks(
	text: string,
	chunks: readonly ChunkAnchor[]
): TextPreviewSegment[] {
	const blocks = markdownBlockStarts(text);
	const snapped: ChunkStart[] = [];
	let blockPosition = 0;

	for (const { chunkIndex, start } of chunkStarts(text, chunks)) {
		while (blockPosition + 1 < blocks.length && blocks[blockPosition + 1] <= start) {
			blockPosition += 1;
		}

		snapped.push({ chunkIndex, start: blocks[blockPosition] });
	}

	return buildSegments(text, snapped);
}
