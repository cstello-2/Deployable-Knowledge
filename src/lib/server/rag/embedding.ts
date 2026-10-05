import { createHash } from 'node:crypto';
import { and, asc, count, eq, gt, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { db } from '../database/database';
import {
	documentChunks,
	documents,
	type NewDocument,
	type NewDocumentChunk
} from '../database/schema';
import { diagnosticEvents } from '../diagnostics/events';
import type { ParsedChunk } from './chunk/parse-shared';
import { embedTexts, getActiveEmbedding } from './embedding-model';
import { putChunkVectors, removeDocumentVectors } from './search/vector-index';
import type { VectorIndexRow } from './search/vector-store';

const INSERT_BATCH_SIZE = 100; //Can adjust later
// Embed in bounded slices so a huge document never holds every raw vector at once
const EMBED_SLICE_SIZE = 256;
const REFRESH_BATCH_SIZE = 128;

type StoreChunksResult = {
	documentId: string;
	chunkCount: number;
};

type ChunkEmbedding = {
	vector: Float32Array;
	key: string;
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
	embedding: ChunkEmbedding | null,
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
		embedding: embedding === null ? null : embeddingToBuffer(embedding.vector),
		embeddingModel: embedding?.key ?? null,
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
	// Embed the final assembled chunks only, so stored vectors match the exact stored content
	const embeddings = documentRow.sourceType === 'CSV' ? [] : await embedChunks(chunks, onProgress);
	const chunkRows = chunks.map((chunk, index) =>
		buildChunkRow(chunk, documentRow.id, embeddings.at(index) ?? null, now)
	);

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
	});

	removeDocumentVectors(documentRow.id);
	putChunkVectors(
		embeddings.map(({ key, vector }, index) => ({
			chunkId: chunks[index].chunkId,
			documentId: documentRow.id,
			chunkType: chunks[index].chunkType,
			key,
			vector
		}))
	);

	if (embeddings.length) {
		const { key: activeKey } = await getActiveEmbedding();
		if (embeddings.some(({ key }) => key !== activeKey)) refreshStaleEmbeddings();
	}

	return {
		documentId: documentRow.id,
		chunkCount: chunkRows.length
	};
}

async function embedChunks(
	chunks: ParsedChunk[],
	onProgress?: (progress: StoreDocumentProgress) => void
): Promise<ChunkEmbedding[]> {
	const embeddings: ChunkEmbedding[] = [];

	for (let offset = 0; offset < chunks.length; offset += EMBED_SLICE_SIZE) {
		const texts = chunks.slice(offset, offset + EMBED_SLICE_SIZE).map((chunk) => chunk.content);
		const reportProgress = (current: number) =>
			onProgress?.({ stage: 'embedding', current: offset + current, total: chunks.length });

		const { key, vectors } = await embedTexts(texts, 'search_document', reportProgress);
		for (const vector of vectors) embeddings.push({ key, vector });
	}

	return embeddings;
}

function staleEmbeddings(key: string) {
	return and(
		isNotNull(documentChunks.embedding),
		or(isNull(documentChunks.embeddingModel), ne(documentChunks.embeddingModel, key))
	);
}

function staleIndexedEmbeddings(key: string) {
	return and(staleEmbeddings(key), ne(documents.sourceType, 'CSV'));
}

export async function countStaleEmbeddings(key: string): Promise<number> {
	const [{ total }] = await db
		.select({ total: count() })
		.from(documentChunks)
		.innerJoin(documents, eq(documents.id, documentChunks.documentId))
		.where(staleIndexedEmbeddings(key));
	return total;
}

async function reembedStaleChunks(): Promise<void> {
	const { provider, settings, key } = await getActiveEmbedding();
	if (!(await provider.isInstalled(settings.model))) return;

	const total = await countStaleEmbeddings(key);
	if (total === 0) return;

	const started = Date.now();
	console.log(`[Embedding] Re-embedding ${total} chunk(s) with ${key}...`);
	diagnosticEvents.embeddingRefreshStarted(total);

	let refreshed = 0;
	let lastId = '';
	for (;;) {
		const batch = await db
			.select({
				id: documentChunks.id,
				documentId: documentChunks.documentId,
				chunkType: documentChunks.chunkType,
				content: documentChunks.content
			})
			.from(documentChunks)
			.innerJoin(documents, eq(documents.id, documentChunks.documentId))
			.where(and(staleIndexedEmbeddings(key), gt(documentChunks.id, lastId)))
			.orderBy(asc(documentChunks.id))
			.limit(REFRESH_BATCH_SIZE);
		if (batch.length === 0) break;
		lastId = batch[batch.length - 1].id;

		if ((await getActiveEmbedding()).key !== key) return;

		const embedded = await embedTexts(
			batch.map((chunk) => chunk.content),
			'search_document'
		);
		const updated: VectorIndexRow[] = [];
		// Rows re-ingested while this batch was embedding already have fresh vectors.
		await db.transaction(async (tx) => {
			for (const [index, chunk] of batch.entries()) {
				const vector = embedded.vectors[index];
				const rows = await tx
					.update(documentChunks)
					.set({ embedding: embeddingToBuffer(vector), embeddingModel: embedded.key })
					.where(and(eq(documentChunks.id, chunk.id), staleEmbeddings(embedded.key)))
					.returning({ id: documentChunks.id });
				if (rows.length === 0) continue;
				updated.push({
					chunkId: chunk.id,
					documentId: chunk.documentId,
					chunkType: chunk.chunkType,
					key: embedded.key,
					vector
				});
			}
		});
		refreshed += updated.length;
		putChunkVectors(updated);
	}

	const durationMs = Date.now() - started;
	console.log(
		`[Embedding] Re-embedded ${refreshed} chunk(s) in ${(durationMs / 1000).toFixed(1)}s.`
	);
	diagnosticEvents.embeddingRefreshCompleted({ chunks: refreshed, durationMs });
}

let refresh: Promise<void> | null = null;
let refreshRequested = false;

// A call during a pass queues one more.
export function refreshStaleEmbeddings(): void {
	if (refresh) {
		refreshRequested = true;
		return;
	}

	refresh = reembedStaleChunks()
		.catch((error) => {
			console.error('[Embedding] Re-embedding stored chunks failed.', error);
			diagnosticEvents.embeddingRefreshFailed();
		})
		.finally(() => {
			refresh = null;
			if (!refreshRequested) return;
			refreshRequested = false;
			refreshStaleEmbeddings();
		});
}
