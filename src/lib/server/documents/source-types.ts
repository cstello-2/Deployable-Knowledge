// Registry of ingestable file formats: supporting a new one means adding a handler here,
// plus a sourceType enum member and a viewer if the format needs one.

import { extname } from 'node:path';
import type { ApiDocumentDirectoryItem, Document } from '$lib/types';
import { assertIngestableAudioSize, SUPPORTED_AUDIO_EXTENSIONS } from '$lib/utils';
import type { ExtractionResult, ParsedChunk, Source } from '$lib/server/rag/chunk/parse-shared';
import { extractText } from '$lib/server/rag/chunk/text-extract';
import { extractPlainText } from '$lib/server/rag/chunk/text-file-extract';
import { extractCsv } from '$lib/server/rag/chunk/tabular-extract';
import { extractSpreadsheet } from '$lib/server/rag/chunk/spreadsheet-extract';
import {
	attachTranscriptTimings,
	extractTranscript
} from '$lib/server/rag/chunk/transcript-extract';
import { convertOfficeToPdf } from './office-converter';

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
	convert?: { extension: '.pdf'; run: (buffer: Buffer) => Promise<Buffer> };
	preview?: { run: (buffer: Buffer) => Promise<Buffer> };
	extract?: (
		source: Source,
		onProgress: (ratio: number, message: string) => void
	) => Promise<ExtractionResult>;
	finalize?: (chunks: ParsedChunk[], extraction: ExtractionResult) => ParsedChunk[];
};

const MAX_TEXT_FILE_BYTES = 25 * 1024 * 1024;

function assertIngestableTextSize(byteLength: number): void {
	if (byteLength > MAX_TEXT_FILE_BYTES) {
		throw new Error('Text files larger than 25 MB are not supported.');
	}
}

function assertTextBuffer(buffer: Buffer): void {
	assertIngestableTextSize(buffer.byteLength);
	if (buffer.subarray(0, 8192).includes(0)) {
		throw new Error('This file contains binary data, not text.');
	}
}

function assertZipContainer(buffer: Buffer): void {
	if (buffer.subarray(0, 4).toString('latin1') !== 'PK\x03\x04') {
		throw new Error('This file is not a valid Office document.');
	}
}

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

const docxHandler: SourceTypeHandler = {
	type: 'DOCX',
	kind: 'docx',
	extensions: ['.docx'],
	storage: 'managed-copy',
	progressLabel: 'Ingesting Word document',
	startMessage: 'Converting to PDF',
	emptyResultMessage: 'No readable text was found in this document.',
	validateBuffer: assertZipContainer,
	convert: { extension: '.pdf', run: (buffer) => convertOfficeToPdf(buffer, 'docx') }
};

const pptxHandler: SourceTypeHandler = {
	type: 'PPTX',
	kind: 'pptx',
	extensions: ['.pptx'],
	storage: 'managed-copy',
	progressLabel: 'Ingesting presentation',
	startMessage: 'Converting to PDF',
	emptyResultMessage: 'No readable text was found in this presentation.',
	validateBuffer: assertZipContainer,
	convert: { extension: '.pdf', run: (buffer) => convertOfficeToPdf(buffer, 'pptx') }
};

const xlsxHandler: SourceTypeHandler = {
	type: 'XLSX',
	kind: 'xlsx',
	extensions: ['.xlsx'],
	storage: 'managed-copy',
	progressLabel: 'Ingesting spreadsheet',
	startMessage: 'Reading workbook',
	emptyResultMessage: 'No cell data was found in this spreadsheet.',
	validateBuffer: assertZipContainer,
	preview: { run: (buffer) => convertOfficeToPdf(buffer, 'xlsx') },
	extract: (source, onProgress) => extractSpreadsheet(source, onProgress)
};

const csvHandler: SourceTypeHandler = {
	type: 'CSV',
	kind: 'csv',
	extensions: ['.csv'],
	storage: 'managed-copy',
	progressLabel: 'Ingesting CSV file',
	startMessage: 'Reading CSV rows',
	emptyResultMessage: 'No table data was found in this CSV file.',
	validateFile: ({ size }) => assertIngestableTextSize(size),
	validateBuffer: assertTextBuffer,
	extract: (source) => extractCsv(source)
};

const textHandler: SourceTypeHandler = {
	type: 'TEXT',
	kind: 'text',
	extensions: ['.txt', '.md', '.markdown'],
	storage: 'managed-copy',
	progressLabel: 'Ingesting text file',
	startMessage: 'Reading text',
	emptyResultMessage: 'No readable text was found in this file.',
	validateFile: ({ size }) => assertIngestableTextSize(size),
	validateBuffer: assertTextBuffer,
	extract: (source) => extractPlainText(source)
};

export const SOURCE_TYPE_HANDLERS: readonly SourceTypeHandler[] = [
	pdfHandler,
	audioHandler,
	docxHandler,
	pptxHandler,
	xlsxHandler,
	csvHandler,
	textHandler
];

export function handlerForPath(path: string): SourceTypeHandler | null {
	const extension = extname(path).toLowerCase();
	return SOURCE_TYPE_HANDLERS.find((handler) => handler.extensions.includes(extension)) ?? null;
}

export function handlerForType(type: Document['sourceType']): SourceTypeHandler | null {
	return SOURCE_TYPE_HANDLERS.find((handler) => handler.type === type) ?? null;
}

export function isSyncableFile(filePath: string): boolean {
	return handlerForPath(filePath) !== null;
}
