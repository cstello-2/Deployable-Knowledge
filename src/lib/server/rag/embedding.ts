import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../database/database';
import {
	documentChunks,
	documents,
	retrievalFeedback,
	type NewDocument,
	type NewDocumentChunk
} from '../database/schema';
import type { ParsedChunk } from './chunk/parse-shared';
import { embedTexts } from './embedding-model';
import { invalidateVectorIndex } from './search/vector-index';

const INSERT_BATCH_SIZE = 100; //Can adjust later
// Embed in bounded slices so a huge document never holds every raw vector at once
const EMBED_SLICE_SIZE = 256;

type StoreChunksResult = {
	documentId: string;
	chunkCount: number;
};

export type StoreDocumentProgress = {
	stage: 'embedding' | 'storing';
	current: number;
	total: number;
};

// SQLite DB stores embeddings as bytes, however semantic search reads them back as Float32 vectors
function embeddingToBuffer(values: Float32Array): Buffer {
	return Buffer.from(values.buffer, values.byteOffset, values.byteLength);
}

// The document id is path based so reingesting the same file replaces the same document. Prevents duplicate documents!
function buildDocumentRow(chunks: ParsedChunk[], now: string): NewDocument {
	const source = chunks[0].source;

	return {
		id: createHash('sha256').update(source.path).digest('hex'),
		title: source.title,
		sourcePath: source.path,
		sourceType: source.type,
		createdAt: now,
		updatedAt: now
	};
}

// Parsed chunks stay pipeline-shaped until this point; this is the DB row mapping boundary
function buildChunkRow(
	chunk: ParsedChunk,
	documentId: string,
	embedding: Float32Array,
	now: string
): NewDocumentChunk {
	return {
		id: chunk.chunkId,
		documentId,
		chunkType: chunk.chunkType,
		pageIndex: chunk.pageIndex,
		chunkIndex: chunk.chunkIndex,
		content: chunk.content,
		startMs: chunk.startMs ?? null,
		endMs: chunk.endMs ?? null,
		embedding: embeddingToBuffer(embedding),
		createdAt: now
	};
}

export async function storeDocumentChunks(
	chunks: ParsedChunk[],
	onProgress?: (progress: StoreDocumentProgress) => void
): Promise<StoreChunksResult> {
	if (chunks.length === 0) {
		throw new Error('Cannot store embeddings for an empty chunk list.');
	}

	const now = new Date().toISOString();
	const documentRow = buildDocumentRow(chunks, now);
	const chunkRows: NewDocumentChunk[] = [];

	// Embed the final assembled chunks only, so stored vectors match the exact stored content
	for (let offset = 0; offset < chunks.length; offset += EMBED_SLICE_SIZE) {
		const slice = chunks.slice(offset, offset + EMBED_SLICE_SIZE);
		const embeddings = await embedTexts(
			slice.map((chunk) => chunk.content),
			'search_document',
			(current) =>
				onProgress?.({ stage: 'embedding', current: offset + current, total: chunks.length })
		);

		for (let index = 0; index < slice.length; index += 1) {
			chunkRows.push(
				buildChunkRow(slice[index], documentRow.id, embeddings[index] ?? new Float32Array(0), now)
			);
		}
	}

	onProgress?.({ stage: 'storing', current: 0, total: chunkRows.length });

	// Upsert the document shell first, then replace its chunks in one clean ingest pass
	await db.transaction(async (tx) => {
		await tx
			.insert(documents)
			.values(documentRow)
			.onConflictDoUpdate({
				target: documents.id,
				set: {
					title: documentRow.title,
					sourcePath: documentRow.sourcePath,
					sourceType: documentRow.sourceType,
					updatedAt: documentRow.updatedAt
				}
			});

		const existingFeedback = await tx
			.select({
				id: retrievalFeedback.id,
				chunkId: retrievalFeedback.chunkId,
				query: retrievalFeedback.query,
				queryHash: retrievalFeedback.queryHash,
				rating: retrievalFeedback.rating,
				retrievalMode: retrievalFeedback.retrievalMode,
				resultRank: retrievalFeedback.resultRank,
				createdAt: retrievalFeedback.createdAt,
				updatedAt: retrievalFeedback.updatedAt
			})
			.from(retrievalFeedback)
			.innerJoin(documentChunks, eq(documentChunks.id, retrievalFeedback.chunkId))
			.where(eq(documentChunks.documentId, documentRow.id));

		await tx.delete(documentChunks).where(eq(documentChunks.documentId, documentRow.id));

		// Batch SQL inserts so large PDFs do not break the code
		for (let index = 0; index < chunkRows.length; index += INSERT_BATCH_SIZE) {
			await tx.insert(documentChunks).values(chunkRows.slice(index, index + INSERT_BATCH_SIZE));
			onProgress?.({
				stage: 'storing',
				current: Math.min(index + INSERT_BATCH_SIZE, chunkRows.length),
				total: chunkRows.length
			});
		}

		const nextChunkIds = new Set(chunkRows.map(({ id }) => id));
		const retainedFeedback = existingFeedback.filter(({ chunkId }) => nextChunkIds.has(chunkId));

		for (let index = 0; index < retainedFeedback.length; index += INSERT_BATCH_SIZE) {
			await tx
				.insert(retrievalFeedback)
				.values(retainedFeedback.slice(index, index + INSERT_BATCH_SIZE))
				.onConflictDoNothing();
		}
	});

	invalidateVectorIndex();

	return {
		documentId: documentRow.id,
		chunkCount: chunkRows.length
	};
}
