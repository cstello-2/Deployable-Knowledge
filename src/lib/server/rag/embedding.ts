import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../database/database';
import {
	documentChunks,
	documents,
	type NewDocument,
	type NewDocumentChunk
} from '../database/schema';
import type { ParsedChunk } from './chunk/parse-shared';
import { embedTexts } from './embedding-model';

const INSERT_BATCH_SIZE = 100; //Can adjust later

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
function embeddingToBuffer(values: number[]): Buffer {
	const array = Float32Array.from(values);
	return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
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
function buildChunkRows(
	chunks: ParsedChunk[],
	documentId: string,
	embeddings: number[][],
	now: string
): NewDocumentChunk[] {
	return chunks.map((chunk, index) => ({
		id: chunk.chunkId,
		documentId,
		chunkType: chunk.chunkType,
		pageIndex: chunk.pageIndex,
		chunkIndex: chunk.chunkIndex,
		content: chunk.content,
		startMs: chunk.startMs ?? null,
		endMs: chunk.endMs ?? null,
		embedding: embeddingToBuffer(embeddings[index] ?? []),
		createdAt: now
	}));
}

export async function storeDocumentChunks(
	chunks: ParsedChunk[],
	onProgress?: (progress: StoreDocumentProgress) => void
): Promise<StoreChunksResult> {
	if (chunks.length === 0) {
		throw new Error('Cannot store embeddings for an empty chunk list.');
	}

	// Embed the final assembled chunks only, so stored vectors match the exact stored content
	const now = new Date().toISOString();
	const documentRow = buildDocumentRow(chunks, now);
	const embeddings = await embedTexts(
		chunks.map((chunk) => chunk.content),
		'search_document',
		(current, total) => onProgress?.({ stage: 'embedding', current, total })
	);
	const chunkRows = buildChunkRows(chunks, documentRow.id, embeddings, now);

	onProgress?.({ stage: 'storing', current: 0, total: chunkRows.length });

	// Upsert the document shell first, then replace its chunks in one clean ingest pass
	await db
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

	await db.delete(documentChunks).where(eq(documentChunks.documentId, documentRow.id));

	// Batch SQL inserts so large PDFs do not break the code
	for (let index = 0; index < chunkRows.length; index += INSERT_BATCH_SIZE) {
		const batch = chunkRows.slice(index, index + INSERT_BATCH_SIZE);
		await db.insert(documentChunks).values(batch);
		onProgress?.({
			stage: 'storing',
			current: Math.min(index + INSERT_BATCH_SIZE, chunkRows.length),
			total: chunkRows.length
		});
	}

	return {
		documentId: documentRow.id,
		chunkCount: chunkRows.length
	};
}
