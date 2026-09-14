import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { inArray } from 'drizzle-orm';
import type {
	ApiDocumentAutotagEntry,
	ApiDocumentAutotagResult,
	ApiDocumentIngestProgress
} from '$lib/types';
import { db } from '$lib/server/database/database';
import { documentTags, documents } from '$lib/server/database/schema';
import { embedTexts } from '$lib/server/rag/embedding-model';
import { getVectorIndex, type VectorIndex } from '$lib/server/rag/search/vector-index';

// A tag's raw similarity says little on its own: the similarity of unrelated words to a
// document swings with its length and vocabulary (0.47 to 0.56 across one small corpus).
// Tags are scored against the document's median similarity to these everyday topics instead.
const BACKGROUND_TOPICS = [
	'architecture',
	'astronomy',
	'board games',
	'cars',
	'chemistry',
	'cooking',
	'dance',
	'fashion',
	'finance',
	'fishing',
	'furniture',
	'gardening',
	'jewelry',
	'marketing',
	'movies',
	'music',
	'photography',
	'poetry',
	'real estate',
	'religion',
	'sports',
	'travel',
	'video games',
	'weather'
];
const MIN_SCORE_ABOVE_BACKGROUND = 0.08;
const MAX_TAGS_PER_DOCUMENT = 5;
const TOP_CHUNKS = 3;
const SCAN_BLOCK_SIZE = 16_384;
const WRITE_BATCH_DOCUMENTS = 100;
const LABEL = 'Autotagging';

type AutotagProgress = (
	progress: ApiDocumentIngestProgress,
	entry?: ApiDocumentAutotagEntry
) => void;

let backgroundVectors: Promise<Float32Array[]> | undefined;

function getBackgroundVectors(): Promise<Float32Array[]> {
	backgroundVectors ??= embedTexts(BACKGROUND_TOPICS, 'search_query').catch((error) => {
		backgroundVectors = undefined;
		throw error;
	});
	return backgroundVectors;
}

async function indexRowsByDocument(
	index: VectorIndex,
	documentIds: Set<string>
): Promise<Map<string, number[]>> {
	const rowsByDocument = new Map<string, number[]>();
	for (let row = 0; row < index.count; row += 1) {
		if (row > 0 && row % SCAN_BLOCK_SIZE === 0) await yieldEventLoop();
		const documentId = index.documentIds[row];
		if (!documentIds.has(documentId)) continue;
		const rows = rowsByDocument.get(documentId);
		if (rows) rows.push(row);
		else rowsByDocument.set(documentId, [row]);
	}
	return rowsByDocument;
}

// Averaging the best few chunks lets a topic covered by one section of a long document count
// without a single stray chunk deciding the match.
function topChunkScore({ dimensions, matrix }: VectorIndex, rows: number[], query: Float32Array) {
	const best = new Array<number>(TOP_CHUNKS).fill(-Infinity);
	for (const row of rows) {
		const base = row * dimensions;
		let score = 0;
		for (let dim = 0; dim < dimensions; dim += 1) score += query[dim] * matrix[base + dim];
		if (score <= best[TOP_CHUNKS - 1]) continue;
		let slot = TOP_CHUNKS - 1;
		while (slot > 0 && best[slot - 1] < score) {
			best[slot] = best[slot - 1];
			slot -= 1;
		}
		best[slot] = score;
	}
	const counted = Math.min(TOP_CHUNKS, rows.length);
	return best.slice(0, counted).reduce((sum, score) => sum + score, 0) / counted;
}

function median(values: number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function matchTags(
	index: VectorIndex,
	rows: number[],
	tagNames: string[],
	tagVectors: Float32Array[],
	background: Float32Array[]
): string[] {
	const floor = median(background.map((vector) => topChunkScore(index, rows, vector)));
	return tagNames
		.map((tag, position) => ({ tag, score: topChunkScore(index, rows, tagVectors[position]) }))
		.filter(({ score }) => score - floor >= MIN_SCORE_ABOVE_BACKGROUND)
		.sort((left, right) => right.score - left.score)
		.slice(0, MAX_TAGS_PER_DOCUMENT)
		.map(({ tag }) => tag);
}

export async function autotagDocuments(
	documentIds: string[],
	tagNames: string[],
	onProgress: AutotagProgress
): Promise<ApiDocumentAutotagResult> {
	onProgress({
		percent: 0,
		label: LABEL,
		message: `Embedding ${tagNames.length} tag${tagNames.length === 1 ? '' : 's'}`
	});
	const [tagVectors, background] = await Promise.all([
		embedTexts(
			tagNames.map((tag) => tag.replace(/[-_]+/g, ' ')),
			'search_query'
		),
		getBackgroundVectors()
	]);

	onProgress({ percent: 5, label: LABEL, message: 'Loading document vectors' });
	const [index, documentRows, assignmentRows] = await Promise.all([
		getVectorIndex(),
		db
			.select({ id: documents.id, title: documents.title })
			.from(documents)
			.where(inArray(documents.id, documentIds)),
		db
			.select({ documentId: documentTags.documentId, tag: documentTags.tag })
			.from(documentTags)
			.where(inArray(documentTags.documentId, documentIds))
	]);
	const rowsByDocument = await indexRowsByDocument(index, new Set(documentIds));
	const assignedByDocument = new Map<string, Set<string>>();
	for (const { documentId, tag } of assignmentRows) {
		const assigned = assignedByDocument.get(documentId);
		if (assigned) assigned.add(tag);
		else assignedByDocument.set(documentId, new Set([tag]));
	}

	const result: ApiDocumentAutotagResult = { applied: 0, skipped: 0, tagged: 0, unchanged: 0 };
	let pending: { documentId: string; tag: string }[] = [];
	const flush = async () => {
		if (!pending.length) return;
		await db.insert(documentTags).values(pending).onConflictDoNothing();
		pending = [];
	};

	for (const [position, document] of documentRows.entries()) {
		const rows = rowsByDocument.get(document.id);
		const entry: ApiDocumentAutotagEntry = {
			documentId: document.id,
			status: 'skipped',
			tags: [],
			title: document.title
		};
		if (rows) {
			const assigned = assignedByDocument.get(document.id);
			entry.tags = matchTags(index, rows, tagNames, tagVectors, background).filter(
				(tag) => !assigned?.has(tag)
			);
			entry.status = entry.tags.length ? 'tagged' : 'unchanged';
			for (const tag of entry.tags) pending.push({ documentId: document.id, tag });
		}
		result[entry.status] += 1;
		result.applied += entry.tags.length;

		if ((position + 1) % WRITE_BATCH_DOCUMENTS === 0) {
			await flush();
			await yieldEventLoop();
		}
		onProgress(
			{
				percent: 10 + ((position + 1) / documentRows.length) * 90,
				label: LABEL,
				message: document.title
			},
			entry
		);
	}
	await flush();

	return result;
}
