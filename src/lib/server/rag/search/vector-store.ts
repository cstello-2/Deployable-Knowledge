import type { SearchChunkType } from './search-shared';

// This is the in-memory copy of every chunk embedding for one model, and it's what semantic
// search scans on each query. The vectors sit back to back in one big Float32Array so the
// scoring loop stays tight, and the chunk id, document id and type for each row live in
// parallel arrays alongside it.
//
// Rewriting that buffer on every change would get expensive fast, so we don't. Deleting a row
// just marks it dead and new rows go on the end. Once about a quarter of the rows are dead,
// compact() copies the live ones into a fresh buffer. Neither growing nor compacting ever writes
// to the old buffer, which is what lets a search hold onto a view() across awaits and keep
// using its row numbers while the index changes underneath it.
//
// Changes come in batches and the last word on a chunk or document wins. Vectors from a
// different model can't be compared with ours, so a put from another model only knocks the
// chunk out instead of adding it.
const COMPACT_RATIO = 0.25;
const GROWTH_FACTOR = 1.25;

export type VectorIndexRow = {
	chunkId: string;
	documentId: string;
	chunkType: SearchChunkType;
	key: string;
	vector: Float32Array;
};

export type VectorIndexChange =
	| { type: 'remove-document'; documentId: string }
	| { type: 'put-chunks'; rows: VectorIndexRow[] };

type NetChanges = {
	removedDocuments: Set<string>;
	removedChunks: Set<string>;
	added: VectorIndexRow[];
};

export class VectorIndex {
	constructor(
		readonly chunkIds: string[],
		readonly documentIds: string[],
		readonly chunkTypes: SearchChunkType[],
		readonly dimensions: number,
		readonly matrix: Float32Array,
		private readonly live: Uint8Array
	) {}

	*rows(): Generator<number> {
		for (let row = 0; row < this.live.length; row += 1) {
			if (this.live[row]) yield row;
		}
	}
}

export class VectorStore {
	private dimensions = 0;
	private count = 0;
	private removed = 0;
	private matrix = new Float32Array(0);
	private live = new Uint8Array(0);
	private chunkIds: string[] = [];
	private documentIds: string[] = [];
	private chunkTypes: SearchChunkType[] = [];
	private snapshot: VectorIndex | null = null;

	constructor(
		readonly key: string,
		private reservedRows: number
	) {}

	get size(): number {
		return this.count - this.removed;
	}

	view(): VectorIndex {
		this.snapshot ??= new VectorIndex(
			this.chunkIds.slice(),
			this.documentIds.slice(),
			this.chunkTypes.slice(),
			this.dimensions,
			this.matrix.subarray(0, this.count * this.dimensions),
			this.live.subarray(0, this.count)
		);
		return this.snapshot;
	}

	append(row: VectorIndexRow): void {
		if (this.dimensions === 0) this.dimensions = row.vector.length;
		if (row.vector.length !== this.dimensions) {
			console.warn(
				`[Search] Chunk ${row.chunkId} embedding has mismatched dimensions; skipping it.`
			);
			return;
		}
		if (this.count === this.live.length) {
			this.resize(
				Math.max(this.reservedRows, Math.ceil(this.count * GROWTH_FACTOR), this.count + 1)
			);
			this.reservedRows = 0;
		}

		this.matrix.set(row.vector, this.count * this.dimensions);
		this.live[this.count] = 1;
		this.chunkIds.push(row.chunkId);
		this.documentIds.push(row.documentId);
		this.chunkTypes.push(row.chunkType);
		this.count += 1;
		this.snapshot = null;
	}

	apply(changes: VectorIndexChange[]): void {
		const { removedDocuments, removedChunks, added } = netChanges(changes, this.key);

		for (let row = 0; row < this.count; row += 1) {
			if (!this.live[row]) continue;
			if (removedDocuments.has(this.documentIds[row]) || removedChunks.has(this.chunkIds[row])) {
				this.live[row] = 0;
				this.removed += 1;
			}
		}

		if (this.removed > this.count * COMPACT_RATIO) this.compact();

		for (const row of added) this.append(row);
	}

	private resize(capacity: number): void {
		const matrix = new Float32Array(capacity * this.dimensions);
		matrix.set(this.matrix.subarray(0, this.count * this.dimensions));
		const live = new Uint8Array(capacity);
		live.set(this.live.subarray(0, this.count));
		this.matrix = matrix;
		this.live = live;
	}

	private compact(): void {
		const kept = this.size;
		const capacity = Math.ceil(kept * GROWTH_FACTOR);
		const matrix = new Float32Array(capacity * this.dimensions);
		const live = new Uint8Array(capacity);
		const chunkIds: string[] = [];
		const documentIds: string[] = [];
		const chunkTypes: SearchChunkType[] = [];

		for (let row = 0; row < this.count; row += 1) {
			if (!this.live[row]) continue;
			const start = row * this.dimensions;
			matrix.set(
				this.matrix.subarray(start, start + this.dimensions),
				chunkIds.length * this.dimensions
			);
			live[chunkIds.length] = 1;
			chunkIds.push(this.chunkIds[row]);
			documentIds.push(this.documentIds[row]);
			chunkTypes.push(this.chunkTypes[row]);
		}

		this.matrix = matrix;
		this.live = live;
		this.chunkIds = chunkIds;
		this.documentIds = documentIds;
		this.chunkTypes = chunkTypes;
		this.count = kept;
		this.removed = 0;
		this.snapshot = null;
		if (kept === 0) this.dimensions = 0;
	}
}

function netChanges(changes: VectorIndexChange[], key: string): NetChanges {
	const removedDocuments = new Set<string>();
	const removedChunks = new Set<string>();
	const addedByDocument = new Map<string, Map<string, VectorIndexRow>>();

	for (const change of changes) {
		if (change.type === 'remove-document') {
			removedDocuments.add(change.documentId);
			addedByDocument.delete(change.documentId);
			continue;
		}

		for (const row of change.rows) {
			removedChunks.add(row.chunkId);
			const added = addedByDocument.get(row.documentId) ?? new Map<string, VectorIndexRow>();
			if (row.key === key) added.set(row.chunkId, row);
			else added.delete(row.chunkId);
			addedByDocument.set(row.documentId, added);
		}
	}

	const added = [...addedByDocument.values()].flatMap((rows) => [...rows.values()]);
	return { removedDocuments, removedChunks, added };
}
