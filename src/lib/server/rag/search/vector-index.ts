import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { asc, count, gt } from 'drizzle-orm';
import { db } from '../../database/database';
import { documentChunks } from '../../database/schema';
import type { SearchChunkType } from './search-shared';

const LOAD_BATCH_SIZE = 4000;

export type VectorIndex = {
	chunkIds: string[];
	documentIds: string[];
	chunkTypes: SearchChunkType[];
	dimensions: number;
	matrix: Float32Array;
	count: number;
};

let indexPromise: Promise<VectorIndex> | undefined;

export function getVectorIndex(): Promise<VectorIndex> {
	indexPromise ??= build().catch((error) => {
		indexPromise = undefined;
		throw error;
	});
	return indexPromise;
}

export function invalidateVectorIndex(): void {
	indexPromise = undefined;
}

function toFloat32(embedding: unknown): Float32Array | null {
	const bytes =
		embedding instanceof Uint8Array
			? embedding
			: embedding instanceof ArrayBuffer
				? new Uint8Array(embedding)
				: null;
	if (!bytes || bytes.byteLength < Float32Array.BYTES_PER_ELEMENT) return null;
	return new Float32Array(
		bytes.buffer,
		bytes.byteOffset,
		Math.floor(bytes.byteLength / Float32Array.BYTES_PER_ELEMENT)
	);
}

async function build(): Promise<VectorIndex> {
	const started = Date.now();
	const [{ total }] = await db.select({ total: count() }).from(documentChunks);

	const chunkIds: string[] = [];
	const documentIds: string[] = [];
	const chunkTypes: SearchChunkType[] = [];
	let dimensions = 0;
	let matrix = new Float32Array(0);
	let rows = 0;
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
			.where(gt(documentChunks.id, lastId))
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
			if (dimensions === 0) {
				dimensions = vector.length;
				matrix = new Float32Array(total * dimensions);
			}
			if (vector.length !== dimensions) {
				console.warn(`[Search] Chunk ${row.id} embedding has mismatched dimensions; skipping it.`);
				continue;
			}
			if ((rows + 1) * dimensions > matrix.length) {
				const grown = new Float32Array(Math.ceil(matrix.length * 1.5) + dimensions);
				grown.set(matrix);
				matrix = grown;
			}
			matrix.set(vector, rows * dimensions);
			chunkIds.push(row.id);
			documentIds.push(row.documentId);
			chunkTypes.push(row.chunkType);
			rows += 1;
		}

		await yieldEventLoop();
	}

	console.log(
		`[Search] Vector index ready: ${rows} chunk(s), ${dimensions} dims, in ${((Date.now() - started) / 1000).toFixed(1)}s.`
	);
	return {
		chunkIds,
		documentIds,
		chunkTypes,
		dimensions,
		matrix: matrix.subarray(0, rows * dimensions),
		count: rows
	};
}
