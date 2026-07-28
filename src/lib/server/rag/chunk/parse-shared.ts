// Helper File to house shared functions across chunk pipeline

import { createHash } from 'node:crypto';
import type { Document, DocumentChunk } from '../../database/schema';

export type MediaType = Document['sourceType'];
export type ChunkType = DocumentChunk['chunkType'];

export type Source = {
	title: Document['title'];
	type: Document['sourceType'];
	path: Document['sourcePath'];
};

// Maps a span of transcript text back to the moment it was spoken; audio only
export type TranscriptTimelineEntry = {
	charStart: number;
	charEnd: number;
	startMs: number;
	endMs: number;
};

export type ExtractedChunk = {
	chunkType: DocumentChunk['chunkType'];
	source: Source;
	pageIndex: DocumentChunk['pageIndex'];
	content: DocumentChunk['content'];
	timeline?: TranscriptTimelineEntry[];
};

export type ParsedChunk = {
	chunkId: DocumentChunk['id'];
	chunkType: DocumentChunk['chunkType'];
	source: Source;
	pageIndex: DocumentChunk['pageIndex'];
	chunkIndex: DocumentChunk['chunkIndex'];
	content: DocumentChunk['content'];
	// Offsets into the prepared page text, kept so audio chunks can resolve their timings
	startChar?: number;
	endChar?: number;
	startMs?: number | null;
	endMs?: number | null;
};

// Every extractor hands back the same page-shaped result, so the rest of the pipeline is shared
export type ExtractionResult = {
	chunks: ExtractedChunk[];
	pageCount: number;
};

// Used to find every instance of consecutive spaces and tabs and converts them single spaces
export function normalizeWhitespace(text: string): string {
	return text
		.replace(/\r\n/g, '\n')
		.replace(/[ \t]+/g, ' ')
		.trim();
}

// Used to ensure chunks satisfy minWords
export function countWords(text: string): number {
	return text.trim().match(/\S+/g)?.length ?? 0;
}

// Create unique chunkId for each chunk, prevents duplicate chunks
export function buildChunkId(page: ExtractedChunk, chunkIndex: number, content: string): string {
	return createHash('sha256')
		.update(page.source.path)
		.update('\n')
		.update(String(page.pageIndex))
		.update('\n')
		.update(String(chunkIndex))
		.update('\n')
		.update(page.chunkType)
		.update('\n')
		.update(content)
		.digest('hex');
}
