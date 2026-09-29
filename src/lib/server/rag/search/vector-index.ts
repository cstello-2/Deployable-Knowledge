import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { and, asc, count, eq, gt, isNotNull, ne } from 'drizzle-orm';
import { db } from '../../database/database';
import { documentChunks, documents } from '../../database/schema';
import {
	VectorStore,
	type VectorIndex,
	type VectorIndexChange,
	type VectorIndexRow
} from './vector-store';

const LOAD_BATCH_SIZE = 4000;
const MAX_PENDING_ROWS = 8192;

type IndexEntry = {
	key: string;
	store: Promise<VectorStore>;
	ready: VectorStore | null;
	pending: VectorIndexChange[];
	pendingRows: number;
};

let current: IndexEntry | undefined;

export async function getVectorIndex(key: string): Promise<VectorIndex> {
	if (current?.key !== key) current = createEntry(key);
	const entry = current;
	const store = await entry.store;
	applyPending(entry, store);
	return store.view();
}

export function removeDocumentVectors(documentId: string): void {
	record({ type: 'remove-document', documentId }, 0);
}

export function putChunkVectors(rows: VectorIndexRow[]): void {
	if (rows.length) record({ type: 'put-chunks', rows }, rows.length);
}

function record(change: VectorIndexChange, rows: number): void {
	const entry = current;
	if (!entry) return;
	entry.pending.push(change);
	entry.pendingRows += rows;
	if (entry.ready && entry.pendingRows >= MAX_PENDING_ROWS) applyPending(entry, entry.ready);
}

function applyPending(entry: IndexEntry, store: VectorStore): void {
	if (entry.pending.length === 0) return;
	const changes = entry.pending;
	entry.pending = [];
	entry.pendingRows = 0;
	store.apply(changes);
}

function createEntry(key: string): IndexEntry {
	const entry: IndexEntry = { key, store: build(key), ready: null, pending: [], pendingRows: 0 };
	entry.store.then(
		(store) => {
			entry.ready = store;
		},
		() => {
			if (current === entry) current = undefined;
		}
	);
	return entry;
}

function toFloat32(embedding: unknown): Float32Array | null {
	let bytes: Uint8Array | null = null;
	if (embedding instanceof Uint8Array) bytes = embedding;
	else if (embedding instanceof ArrayBuffer) bytes = new Uint8Array(embedding);
	if (!bytes || bytes.byteLength < Float32Array.BYTES_PER_ELEMENT) return null;
	return new Float32Array(
		bytes.buffer,
		bytes.byteOffset,
		Math.floor(bytes.byteLength / Float32Array.BYTES_PER_ELEMENT)
	);
}

async function build(key: string): Promise<VectorStore> {
	const started = Date.now();
	const embeddedChunks = and(
		isNotNull(documentChunks.embedding),
		eq(documentChunks.embeddingModel, key),
		ne(documents.sourceType, 'CSV')
	);
	const [{ total }] = await db
		.select({ total: count() })
		.from(documentChunks)
		.innerJoin(documents, eq(documents.id, documentChunks.documentId))
		.where(embeddedChunks);

	const store = new VectorStore(key, total);
	let lastId = '';

	for (;;) {
		const batch = await db
			.select({
				id: documentChunks.id,
				documentId: documentChunks.documentId,
				chunkType: documentChunks.chunkType,
				embedding: documentChunks.embedding
			})
			.from(documentChunks)
			.innerJoin(documents, eq(documents.id, documentChunks.documentId))
			.where(and(embeddedChunks, gt(documentChunks.id, lastId)))
			.orderBy(asc(documentChunks.id))
			.limit(LOAD_BATCH_SIZE);
		if (batch.length === 0) break;
		lastId = batch[batch.length - 1].id;

		for (const row of batch) {
			const vector = toFloat32(row.embedding);
			if (!vector) {
				console.warn(`[Search] Chunk ${row.id} has no readable embedding; skipping it.`);
				continue;
			}
			store.append({
				chunkId: row.id,
				documentId: row.documentId,
				chunkType: row.chunkType,
				key,
				vector
			});
		}

		await yieldEventLoop();
	}

	console.log(
		`[Search] Vector index ready: ${store.size} chunk(s), ${store.view().dimensions} dims, in ${((Date.now() - started) / 1000).toFixed(1)}s.`
	);
	return store;
}
