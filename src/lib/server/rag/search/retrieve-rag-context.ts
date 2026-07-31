import { searchSemantic } from './semantic-search';
import { searchHybrid } from './hybrid-search';
import { searchBm25 } from './bm25-search';
import type { SearchChunkType, SearchMatchBase } from './search-shared';
import { DEFAULT_ASSISTANT_CONFIG, RAG_CHUNK_CHARACTER_LIMIT } from '$lib/constants';
import { RetrievalMode } from '$lib/enums';
import {
	searchKnowledgeGraph,
	type KnowledgeGraphPath
} from '$lib/server/knowledge-graph';
import { compactText } from '$lib/server/utils/values';

const MAX_PREVIEW_CHARS = 200;
const ENV_RETRIEVAL_MODES: readonly RetrievalMode[] = [
	RetrievalMode.BM25,
	RetrievalMode.SEMANTIC,
	RetrievalMode.HYBRID,
	RetrievalMode.KNOWLEDGE_GRAPH
];
const DEFAULT_RETRIEVAL_MODE =
	ENV_RETRIEVAL_MODES.find((mode) => mode === process.env.RAG_RETRIEVAL_MODE) ??
	DEFAULT_ASSISTANT_CONFIG.retrievalMode;

export type RagRetrievalMode = RetrievalMode;

export function resolveRagRetrievalMode(...candidates: unknown[]): RagRetrievalMode {
	for (const candidate of candidates) {
		if (
			candidate === RetrievalMode.SEMANTIC ||
			candidate === RetrievalMode.BM25 ||
			candidate === RetrievalMode.HYBRID ||
			candidate === RetrievalMode.KNOWLEDGE_GRAPH
		) {
			return candidate;
		}
	}
	return RetrievalMode.HYBRID;
}

export type RagSource = {
	title: string;
	description: string;
	documentId: string;
	chunkId: string;
	sourceType: SearchMatchBase['sourceType'];
	pageIndex: number;
	chunkIndex: number;
	score?: number;
	rawScore?: number;
	content?: string;
	sourceTitle?: string;
	chunkType?: SearchChunkType;
};

export type RagContextResult = {
	mode: RagRetrievalMode;
	contextBlock: string;
	sources: RagSource[];
};

type RagMatch = SearchMatchBase & { score?: number };

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
export function buildSources(matches: RagMatch[]): RagSource[] {
	const hasExplicitScores = matches.some((match) => Number.isFinite(match.score));
	const rawScores = matches.map((match, index) =>
		Number.isFinite(match.score)
			? (match.score ?? 0)
			: hasExplicitScores
				? 0
				: matches.length === 1
					? 1
					: 1 - index / Math.max(1, matches.length - 1)
	);
	const maxRawScore = Math.max(0, ...rawScores);

	return matches.map((match, index) => {
		const preview = compactText(match.content, MAX_PREVIEW_CHARS);

		return {
			title: match.sourceTitle,
			// Transcripts have no pages, so only paged sources get a page reference
			description:
				match.sourceType === 'AUDIO'
					? preview
					: match.sourceType === 'XLSX'
						? `Sheet ${match.pageIndex + 1}: ${preview}`
						: `Page ${match.pageIndex + 1}: ${preview}`,
			documentId: match.documentId,
			chunkId: match.chunkId,
			sourceType: match.sourceType,
			pageIndex: match.pageIndex,
			chunkIndex: match.chunkIndex,
			score: maxRawScore > 1 ? rawScores[index] / maxRawScore : rawScores[index],
			rawScore: rawScores[index],
			content: match.content,
			sourceTitle: match.sourceTitle,
			chunkType: match.chunkType
		};
	});
}

function formatGraphPaths(paths: KnowledgeGraphPath[]): string {
	if (!paths.length) return '';

	const lines = paths.slice(0, 8).flatMap((path, index) => {
		const chain = path.nodes
			.map((node, nodeIndex) => {
				if (nodeIndex === 0) return node.label;
				const relation = path.edges[nodeIndex - 1]?.relation ?? 'RELATED_TO';
				return `--${relation}--> ${node.label}`;
			})
			.join(' ');

		const evidence = path.edges
			.map((edge) => compactText(edge.evidence, 260))
			.filter(Boolean)
			.slice(0, 2);

		return [`[Path ${index + 1}] ${chain}`, ...evidence.map((item) => `  evidence: ${item}`)];
	});

	return ['Retrieved knowledge-graph paths and relationship evidence:', '', ...lines].join('\n');
}

// Chat uses hybrid by default. Set RAG_RETRIEVAL_MODE=semantic / bm25 to force one path
// May want to switch to hybrid only in the future, kept for now to test/validate
export async function retrieveRagContext({
	question,
	documentIds = [],
	chunkTypes = ['TEXT', 'TABLE', 'IMAGE'],
	topK = DEFAULT_ASSISTANT_CONFIG.ragTopK,
	mode = DEFAULT_RETRIEVAL_MODE
}: {
	question: string;
	documentIds?: string[];
	chunkTypes?: SearchChunkType[];
	topK?: number;
	mode?: RagRetrievalMode;
}): Promise<RagContextResult> {
	const searchOptions = {
		query: question,
		topK,
		documentIds,
		chunkTypes
	};
	let matches: SearchMatchBase[];

	if (mode === RetrievalMode.BM25) {
		const search = await searchBm25(searchOptions);
		matches = search.results.map(({ score: _score, ...match }) => match);
	} else if (mode === RetrievalMode.HYBRID) {
		matches = (await searchHybrid(searchOptions)).results;
	} else if (mode === RetrievalMode.KNOWLEDGE_GRAPH) {
		const search = await searchKnowledgeGraph({
			...searchOptions,
			topK: Math.max(topK, 8)
		});
		return {
			mode,
			contextBlock: [
				'Use the retrieved chunks plus the graph paths below. Explain the answer with the relationship evidence when it helps, not just the shortest fact.',
				formatContext(search.results),
				formatGraphPaths(search.paths)
			]
				.filter(Boolean)
				.join('\n\n'),
			sources: buildSources(search.results.slice(0, topK))
		};
	} else {
		const search = await searchSemantic(searchOptions);
		matches = search.results.map(({ score: _score, ...match }) => match);
	}

	return {
		mode,
		contextBlock: formatContext(matches),
		sources: buildSources(matches)
	};
}
