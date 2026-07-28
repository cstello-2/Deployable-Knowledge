import { basename } from 'node:path';
import type { ApiDocumentIngestProgress } from '$lib/types';
import { handlerForPath } from '$lib/server/documents/source-types';
import { chunkPages } from '$lib/server/rag/chunk/chunker';
import { assembleChunks } from '$lib/server/rag/chunk/assemble-chunks';
import type { Source } from '$lib/server/rag/chunk/parse-shared';
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

// Shared ingest path for both terminal commands (testing) and UI routes
export async function ingestDocument(
	{ filePath, title }: IngestDocumentInput,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<IngestDocumentResult> {
	const handler = handlerForPath(filePath);
	if (!handler) throw new Error('Unsupported document type.');

	const report = (percent: number, message: string) => {
		onProgress?.({ percent, label: handler.progressLabel, message });
	};

	// Keep source info together so every downstream chunk can carry the same document identity
	const source: Source = {
		title: title?.trim() || basename(filePath),
		type: handler.type,
		path: filePath
	};

	report(0, handler.startMessage);

	const extraction = await handler.extract(source, (ratio, message) => report(ratio * 50, message));

	const rawChunks = chunkPages(extraction.chunks);
	const assembled = assembleChunks(extraction.chunks, rawChunks);
	const chunks = handler.finalize?.(assembled, extraction) ?? assembled;

	// Silent, empty, or too short sources leave nothing worth embedding
	if (chunks.length === 0) throw new Error(handler.emptyResultMessage);

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
