import { basename } from 'node:path';
import type { ApiDocumentIngestProgress, Document } from '$lib/types';
import { handlerForPath, handlerForType } from '$lib/server/documents/source-types';
import { chunkPages } from '$lib/server/rag/chunk/chunker';
import { assembleChunks } from '$lib/server/rag/chunk/assemble-chunks';
import type { Source } from '$lib/server/rag/chunk/parse-shared';
import { invalidateKnowledgeGraphCache } from '$lib/server/knowledge-graph/graph-index';
import { rebuildDocumentTriplets } from '$lib/server/knowledge-graph/triplet-store';
import { storeDocumentChunks } from './embedding';

export type IngestDocumentInput = {
	filePath: string;
	title?: string;
	sourceType?: Document['sourceType'];
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
	{ filePath, title, sourceType }: IngestDocumentInput,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<IngestDocumentResult> {
	const handler = handlerForPath(filePath);
	if (!handler?.extract) throw new Error('Unsupported document type.');
	const extract = handler.extract;
	const identity = handlerForType(sourceType ?? handler.type) ?? handler;

	const report = (percent: number, message: string) => {
		onProgress?.({ percent, label: identity.progressLabel, message });
	};

	// Keep source info together so every downstream chunk can carry the same document identity
	const source: Source = {
		title: title?.trim() || basename(filePath),
		type: sourceType ?? handler.type,
		path: filePath
	};

	report(0, handler.startMessage);

	const extraction = await extract(source, (ratio, message) => report(ratio * 50, message));

	const rawChunks = chunkPages(extraction.chunks);
	const assembled = assembleChunks(extraction.chunks, rawChunks);
	const chunks = handler.finalize?.(assembled, extraction) ?? assembled;

	// Silent, empty, or too short sources leave nothing worth embedding
	if (chunks.length === 0) throw new Error(identity.emptyResultMessage);

	report(50, `Embedding 0 of ${chunks.length} chunks`);

	const stored = await storeDocumentChunks(chunks, ({ stage, current, total }) => {
		if (stage !== 'embedding') return;
		const ratio = total > 0 ? current / total : 1;
		report(50 + ratio * 50, `Embedding ${current} of ${total} chunks`);
	});
	report(100, 'Building Knowledge Graph triplets');
	await rebuildDocumentTriplets(stored.documentId, chunks);
	invalidateKnowledgeGraphCache();

	return {
		documentId: stored.documentId,
		title: source.title,
		sourcePath: source.path,
		pageCount: extraction.pageCount,
		chunkCount: stored.chunkCount
	};
}
