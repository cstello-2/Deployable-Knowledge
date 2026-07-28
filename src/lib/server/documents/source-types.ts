// Registry of ingestable file formats: supporting a new one means adding a handler here,
// plus a sourceType enum member and a viewer if the format needs one.

import { extname } from 'node:path';
import type { ApiDocumentDirectoryItem, Document } from '$lib/types';
import { assertIngestableAudioSize, SUPPORTED_AUDIO_EXTENSIONS } from '$lib/utils';
import type { ExtractionResult, ParsedChunk, Source } from '$lib/server/rag/chunk/parse-shared';
import { extractText } from '$lib/server/rag/chunk/text-extract';
import {
	attachTranscriptTimings,
	extractTranscript
} from '$lib/server/rag/chunk/transcript-extract';

export type SourceTypeHandler = {
	type: Document['sourceType'];
	kind: Exclude<ApiDocumentDirectoryItem['kind'], 'folder'>;
	extensions: readonly string[];
	// How manual ingestion stores the bytes; folder sync keeps a managed copy regardless
	storage: 'managed-copy' | 'in-place';
	progressLabel: string;
	startMessage: string;
	emptyResultMessage: string;
	validateFile?: (file: { path: string; size: number }) => void;
	validateBuffer?: (buffer: Buffer) => void;
	extract: (
		source: Source,
		onProgress: (ratio: number, message: string) => void
	) => Promise<ExtractionResult>;
	finalize?: (chunks: ParsedChunk[], extraction: ExtractionResult) => ParsedChunk[];
};

const pdfHandler: SourceTypeHandler = {
	type: 'PDF',
	kind: 'pdf',
	extensions: ['.pdf'],
	storage: 'managed-copy',
	progressLabel: 'Ingesting PDF',
	startMessage: 'Starting OCR',
	emptyResultMessage: 'No readable text was found in this document.',
	validateBuffer: (buffer) => {
		if (buffer.subarray(0, 5).toString() !== '%PDF-') {
			throw new Error('Only PDF uploads are supported.');
		}
	},
	extract: (source, onProgress) =>
		extractText(source, (current, total) => {
			onProgress(current / total, `OCR page ${current} of ${total}`);
		})
};

const audioHandler: SourceTypeHandler = {
	type: 'AUDIO',
	kind: 'audio',
	extensions: SUPPORTED_AUDIO_EXTENSIONS,
	storage: 'in-place',
	progressLabel: 'Transcribing audio',
	startMessage: 'Decoding audio',
	emptyResultMessage: 'No speech long enough to index was found in this audio file.',
	validateFile: ({ size }) => assertIngestableAudioSize(size),
	extract: (source, onProgress) => extractTranscript(source, onProgress),
	finalize: (chunks, extraction) => attachTranscriptTimings(chunks, extraction.chunks[0]?.timeline)
};

export const SOURCE_TYPE_HANDLERS: readonly SourceTypeHandler[] = [pdfHandler, audioHandler];

export function handlerForPath(path: string): SourceTypeHandler | null {
	const extension = extname(path).toLowerCase();
	return SOURCE_TYPE_HANDLERS.find((handler) => handler.extensions.includes(extension)) ?? null;
}

export function isSyncableFile(filePath: string): boolean {
	return handlerForPath(filePath) !== null;
}
