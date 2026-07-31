import { searchAllMethods } from '../rag/search/hybrid-search';
import {
	buildSources,
	retrieveRagContext,
	type RagRetrievalMode,
	type RagSource
} from '../rag/search/retrieve-rag-context';
import type { AgentTool } from './types';
import { createToolResult, sourceOutput } from './result';
import { DEFAULT_ASSISTANT_CONFIG } from '$lib/constants';
import { RetrievalMode } from '$lib/enums';
import { clampInteger, clampText, readObject } from '../utils/values';

type SearchMode = RagRetrievalMode | 'all';

type SearchAllData = Awaited<ReturnType<typeof searchAllMethods>>;

type SearchToolData =
	| SearchAllData
	| {
			query: string;
			mode: RagRetrievalMode;
			context: string;
			sources: RagSource[];
	  };

const SEARCH_MODES = new Set<SearchMode>([
	RetrievalMode.SEMANTIC,
	RetrievalMode.BM25,
	RetrievalMode.HYBRID,
	RetrievalMode.KNOWLEDGE_GRAPH,
	'all'
]);

export const searchTool: AgentTool<SearchToolData> = {
	id: 'search',
	label: 'Document search',
	description: 'Retrieves relevant chunks from the document knowledge base during document chat.',
	modes: ['document'],
	instructions: `DOCUMENT SEARCH POLICY:
- The search tool is how document context is obtained; no search context exists until you call it.
- For any factual question that may relate to the user's documents, files, or knowledge base, call search in the current turn before answering.
- Never treat the initially empty context as proof that the documents lack an answer.
- Use a focused standalone query. If the first results are empty or insufficient, try a shorter query, different keywords, or a more specific query before giving up while turns remain.
- Base document-specific claims only on search results. Only after searching may you say that the available documents do not answer the question.
- Do not use search for synthetic data, creative work, calculations, time, or visualization requests unless the user also asks for facts from their documents. Use the tool that directly matches the task.
- Never use search as generic recovery for uncertainty or another tool's failure.`,
	definition: {
		description:
			"Search the user's local document knowledge base and return relevant source chunks. You MUST use this before answering document-related factual questions or saying that you do not know, lack context, cannot find an answer, or need more information. If results are insufficient, refine the query and call search again.",
		parameters: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description:
						'A focused standalone search query. Preserve important names and technical terms.'
				},
				mode: {
					type: 'string',
					enum: ['semantic', 'bm25', 'hybrid', 'graph'],
					description: 'Optional retrieval method. Defaults to the configured method.'
				},
				top_k: {
					type: 'integer',
					minimum: 1,
					maximum: 20,
					description: 'Optional number of chunks. Defaults to the configured search limit.'
				}
			},
			required: ['query'],
			additionalProperties: false
		}
	},

	async execute(argumentsValue, context) {
		const args = readObject(argumentsValue);
		const query = clampText(args.query, 2_000);

		if (!query) throw new Error('search requires a non-empty query');

		const requestedMode = typeof args.mode === 'string' ? args.mode : '';
		const mode: SearchMode = SEARCH_MODES.has(requestedMode as SearchMode)
			? (requestedMode as SearchMode)
			: (context.retrievalMode ?? DEFAULT_ASSISTANT_CONFIG.retrievalMode);
		const maxTopK = clampInteger(context.maxSearchTopK, 1, 100, 20);
		const topK = clampInteger(
			args.top_k ?? context.ragTopK,
			1,
			maxTopK,
			DEFAULT_ASSISTANT_CONFIG.ragTopK
		);
		const documentIds = context.documentIds;

		if (mode === 'all') {
			const data = await searchAllMethods({ query, topK, documentIds });

			const sources = buildSources(data.hybrid);
			return createToolResult(data, {
				outputs: sources.map(sourceOutput)
			});
		}

		const result = await retrieveRagContext({
			question: query,
			documentIds,
			mode,
			topK
		});
		const data = {
			query,
			mode: result.mode,
			context: result.contextBlock || 'No relevant document chunks found.',
			sources: result.sources
		};

		return createToolResult(data, {
			outputs: result.sources.map(sourceOutput)
		});
	}
};
