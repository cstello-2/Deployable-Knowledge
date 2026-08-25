import { basename } from 'node:path';
import type { ApiDocumentIngestProgress, Document } from '$lib/types';
import { diagnosticEvents } from '$lib/server/diagnostics/events';
import { handlerForPath, handlerForType } from '$lib/server/documents/source-types';
import { chunkPages } from '$lib/server/rag/chunk/chunker';
import { assembleChunks } from '$lib/server/rag/chunk/assemble-chunks';
import type { Source } from '$lib/server/rag/chunk/parse-shared';
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

export async function ingestDocument(
	{ filePath, title, sourceType }: IngestDocumentInput,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<IngestDocumentResult> {
	const handler = handlerForPath(filePath) ?? (sourceType ? handlerForType(sourceType) : null);
	if (!handler?.extract) throw new Error('Unsupported document type.');
	const extract = handler.extract;
	const identity = handlerForType(sourceType ?? handler.type) ?? handler;

	const report = (percent: number, message: string) => {
		onProgress?.({ percent, label: identity.progressLabel, message });
	};

	const source: Source = {
		title: title?.trim() || basename(filePath),
		type: sourceType ?? handler.type,
		path: filePath
	};

	report(0, handler.startMessage);

	const started = Date.now();
	try {
		console.log(`[Ingest] Extracting ${source.type} document...`);
		const extraction = await extract(source, (ratio, message) => report(ratio * 50, message));

		const rawChunks = chunkPages(extraction.chunks);
		const assembled = assembleChunks(extraction.chunks, rawChunks);
		const chunks = handler.finalize?.(assembled, extraction) ?? assembled;

		if (chunks.length === 0) throw new Error(identity.emptyResultMessage);

		console.log(
			`[Ingest] Extracted ${extraction.pageCount} page(s); embedding ${chunks.length} chunk(s)...`
		);
		report(50, `Embedding 0 of ${chunks.length} chunks`);

		let lastMilestone = 0;
		const stored = await storeDocumentChunks(chunks, ({ stage, current, total }) => {
			if (stage !== 'embedding') return;
			const ratio = total > 0 ? current / total : 1;
			const milestone = Math.floor(ratio * 4);
			if (milestone > lastMilestone && milestone < 4) {
				lastMilestone = milestone;
				console.log(`[Ingest] Embedded ${current}/${total} chunk(s)`);
			}
			report(50 + ratio * 50, `Embedding ${current} of ${total} chunks`);
		});

		console.log(`[Ingest] Stored ${stored.chunkCount} chunk(s).`);
		diagnosticEvents.documentIngestCompleted({
			chunkCount: stored.chunkCount,
			durationMs: Date.now() - started,
			pageCount: extraction.pageCount,
			sourceType: source.type
		});

		return {
			documentId: stored.documentId,
			title: source.title,
			sourcePath: source.path,
			pageCount: extraction.pageCount,
			chunkCount: stored.chunkCount
		};
	} catch (error) {
		diagnosticEvents.documentIngestFailed(source.type);
		throw error;
	}
}
