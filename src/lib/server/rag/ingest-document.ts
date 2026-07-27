import { basename, extname } from 'node:path';
import type { ApiDocumentIngestProgress } from '$lib/types';
import { extractText } from '$lib/server/rag/chunk/text-extract';
import { extractTranscript } from '$lib/server/rag/chunk/transcript-extract';
import { chunkPages } from '$lib/server/rag/chunk/chunker';
import { assembleChunks } from '$lib/server/rag/chunk/assemble-chunks';
import type { Source } from '$lib/server/rag/chunk/parse-shared';
import { isSupportedAudioPath } from '$lib/utils';
import { storeDocumentChunks } from './embedding';

export type IngestDocumentInput = {
	filePath: string;
	title?: string;
};

export type IngestDocumentResult = {
	documentId: string;
	title: string;
	sourcePath: string;
	pageCount: number;
	chunkCount: number;
};

const SUPPORTED_EXTENSIONS = new Set(['.pdf']);

// Only file types folder sync tracks; audio is transcribed one explicitly chosen file at a time
export function isSupportedDocument(filePath: string): boolean {
	return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

// Shared ingest path for both terminal commands (testing) and UI routes
export async function ingestDocument(
	{ filePath, title }: IngestDocumentInput,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<IngestDocumentResult> {
	const audio = isSupportedAudioPath(filePath);
	if (!audio && !isSupportedDocument(filePath)) throw new Error('Unsupported document type.');

	const label = audio ? 'Transcribing audio' : 'Ingesting PDF';
	const report = (percent: number, message: string) => {
		onProgress?.({ percent, label, message });
	};

	// Keep source info together so every downstream chunk can carry the same document identity
	const source: Source = {
		title: title?.trim() || basename(filePath),
		type: audio ? 'AUDIO' : 'PDF', // NOTE: PDF and audio for now, .docx later
		path: filePath
	};

	// Updated linear ingest path: extract pages/transcript, chunk text, assemble final chunks, then store
	report(0, audio ? 'Decoding audio' : 'Starting OCR');

	// Both extractors hand back the same page-shaped chunks, so the rest of the pipeline is shared
	const extraction = audio
		? await extractTranscript(source, (ratio, message) => report(ratio * 50, message))
		: await extractText(source, (current, total) => {
				report((current / total) * 50, `OCR page ${current} of ${total}`);
			});

	const rawChunks = chunkPages(extraction.chunks);
	const chunks = assembleChunks(extraction.chunks, rawChunks);

	// Silent, empty, or too short sources leave nothing worth embedding
	if (chunks.length === 0) {
		throw new Error(
			audio
				? 'No speech long enough to index was found in this audio file.'
				: 'No readable text was found in this document.'
		);
	}

	report(50, `Embedding 0 of ${chunks.length} chunks`);

	const stored = await storeDocumentChunks(chunks, ({ stage, current, total }) => {
		if (stage !== 'embedding') return;
		const ratio = total > 0 ? current / total : 1;
		report(50 + ratio * 50, `Embedding ${current} of ${total} chunks`);
	});

	return {
		documentId: stored.documentId,
		title: source.title,
		sourcePath: source.path,
		pageCount: extraction.pageCount,
		chunkCount: stored.chunkCount
	};
}
