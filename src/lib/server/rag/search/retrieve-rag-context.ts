import { searchSemantic } from './semantic-search';
import { searchHybrid } from './hybrid-search';
import { searchBm25 } from './bm25-search';
import { getChunkPositions, type ChunkPosition } from './chunk-positions';
import type { ScoredSearchMatch, SearchChunkType, SearchMatchBase } from './search-shared';
import { DEFAULT_ASSISTANT_CONFIG, RAG_CHUNK_CHARACTER_LIMIT } from '$lib/constants';
import { RetrievalMode } from '$lib/enums';
import { compactText } from '$lib/server/utils/values';

const MAX_PREVIEW_CHARS = 200;
const ENV_RETRIEVAL_MODES: readonly RetrievalMode[] = [RetrievalMode.BM25, RetrievalMode.SEMANTIC];
const DEFAULT_RETRIEVAL_MODE =
	ENV_RETRIEVAL_MODES.find((mode) => mode === process.env.RAG_RETRIEVAL_MODE) ??
	DEFAULT_ASSISTANT_CONFIG.retrievalMode;

export type RagRetrievalMode = RetrievalMode;

export type SearchConfidence = 'low' | 'medium' | 'high';

export const SEARCH_CONFIDENCE_LEVELS: readonly SearchConfidence[] = ['low', 'medium', 'high'];

const SEMANTIC_CONFIDENCE_THRESHOLDS: Record<SearchConfidence, number> = {
	low: 0,
	medium: 0.55,
	high: 0.7
};
const HYBRID_CONFIDENCE_THRESHOLDS: Record<SearchConfidence, number> = {
	low: 0,
	medium: 0.2,
	high: 0.5
};
const BM25_RELATIVE_CONFIDENCE_THRESHOLDS: Record<SearchConfidence, number> = {
	low: 0,
	medium: 0.35,
	high: 0.6
};
const BM25_ABSOLUTE_CONFIDENCE_MINIMUMS: Record<SearchConfidence, number> = {
	low: 0,
	medium: 0.8,
	high: 1.5
};

function filterByConfidence(
	matches: ScoredSearchMatch[],
	mode: RagRetrievalMode,
	confidence: SearchConfidence | undefined
): ScoredSearchMatch[] {
	if (!confidence || confidence === 'low' || matches.length === 0) return matches;

	if (mode === RetrievalMode.BM25) {
		const top = Math.max(...matches.map(({ score }) => score));
		const threshold = Math.max(
			top * BM25_RELATIVE_CONFIDENCE_THRESHOLDS[confidence],
			BM25_ABSOLUTE_CONFIDENCE_MINIMUMS[confidence]
		);
		return matches.filter(({ score }) => score >= threshold);
	}

	const thresholds =
		mode === RetrievalMode.HYBRID ? HYBRID_CONFIDENCE_THRESHOLDS : SEMANTIC_CONFIDENCE_THRESHOLDS;
	return matches.filter(({ score }) => score >= thresholds[confidence]);
}

export type RagSource = {
	title: string;
	description: string;
	documentId: string;
	chunkId: string;
	sourceType: SearchMatchBase['sourceType'];
	pageIndex: number;
	chunkIndex: number;
	position?: number;
	totalChunks?: number;
};

export function describeChunkLocation(
	sourceType: SearchMatchBase['sourceType'],
	pageIndex: number,
	preview: string
): string {
	if (sourceType === 'AUDIO' || sourceType === 'YOUTUBE') return preview;
	if (sourceType === 'XLSX') return `Sheet ${pageIndex + 1}: ${preview}`;
	return `Page ${pageIndex + 1}: ${preview}`;
}

export type RagContextResult = {
	mode: RagRetrievalMode;
	contextBlock: string;
	sources: RagSource[];
};

// Format retrieved chunks in the old RAG prompt style
function formatContext(matches: SearchMatchBase[]) {
	if (matches.length === 0) return '';

	const items = matches.map((match) => {
		const content = compactText(match.content, RAG_CHUNK_CHARACTER_LIMIT);
		const source = match.sourceTitle || match.sourcePath || 'unknown';

		return `- ${content} (source: ${source})`;
	});

	return ['Relevant context:', ...items].join('\n');
}

// Sources are the user-facing citation list, so keep them shorter than the model context
export function buildSources(
	matches: SearchMatchBase[],
	positions?: Map<string, ChunkPosition>
): RagSource[] {
	return matches.map((match) => {
		const preview = compactText(match.content, MAX_PREVIEW_CHARS);
		const chunkPosition = positions?.get(match.chunkId);

		return {
			title: match.sourceTitle,
			// Transcripts have no pages, so only paged sources get a page reference
			description: describeChunkLocation(match.sourceType, match.pageIndex, preview),
			documentId: match.documentId,
			chunkId: match.chunkId,
			sourceType: match.sourceType,
			pageIndex: match.pageIndex,
			chunkIndex: match.chunkIndex,
			...(chunkPosition
				? { position: chunkPosition.position, totalChunks: chunkPosition.totalChunks }
				: {})
		};
	});
}

// Chat uses hybrid by default. Set RAG_RETRIEVAL_MODE=semantic / bm25 to force one path
// May want to switch to hybrid only in the future, kept for now to test/validate
export async function retrieveRagContext({
	question,
	documentIds = [],
	chunkTypes = ['TEXT', 'TABLE', 'IMAGE'],
	topK = DEFAULT_ASSISTANT_CONFIG.ragTopK,
	mode = DEFAULT_RETRIEVAL_MODE,
	confidence
}: {
	question: string;
	documentIds?: string[];
	chunkTypes?: SearchChunkType[];
	topK?: number;
	mode?: RagRetrievalMode;
	confidence?: SearchConfidence;
}): Promise<RagContextResult> {
	const searchOptions = {
		query: question,
		topK,
		documentIds,
		chunkTypes
	};
	let scored: ScoredSearchMatch[];

	if (mode === RetrievalMode.BM25) {
		scored = (await searchBm25(searchOptions)).results;
	} else if (mode === RetrievalMode.HYBRID) {
		scored = (await searchHybrid(searchOptions)).results;
	} else {
		scored = (await searchSemantic(searchOptions)).results;
	}

	const matches: SearchMatchBase[] = filterByConfidence(scored, mode, confidence).map(
		({ score: _score, ...match }) => match
	);

	const positions = await getChunkPositions(matches);

	return {
		mode,
		contextBlock: formatContext(matches),
		sources: buildSources(matches, positions)
	};
}
