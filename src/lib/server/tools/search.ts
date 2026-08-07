import { searchAllMethods } from '../rag/search/hybrid-search';
import { getChunkPositions } from '../rag/search/chunk-positions';
import {
	buildSources,
	retrieveRagContext,
	SEARCH_CONFIDENCE_LEVELS,
	type RagRetrievalMode,
	type RagSource,
	type SearchConfidence
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
			searchType: RagRetrievalMode;
			context: string;
			sources: RagSource[];
	  };

const SEARCH_MODES = new Set<SearchMode>([
	RetrievalMode.SEMANTIC,
	RetrievalMode.BM25,
	RetrievalMode.HYBRID,
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
- Never combine unrelated questions into one query. When the user asks several questions, search for each one separately — a long series of consecutive search calls is expected and correct. Keep a mental checklist of the questions and continue searching until every one has been looked up.
- Base document-specific claims only on search results. Only after searching may you say that the available documents do not answer the question.
- Do not use search for synthetic data, creative work, calculations, time, or visualization requests unless the user also asks for facts from their documents. Use the tool that directly matches the task.
- Never use search as generic recovery for uncertainty or another tool's failure.
- Choose searchType to fit the query: use 'bm25' when the answer hinges on literal tokens (proper names, acronyms, part numbers, error codes, quoted phrases); use 'semantic' when the question is conceptual or likely worded differently than the source documents; use 'hybrid' when unsure or when the query mixes both. Omitting searchType uses the user's configured default.
- Use confidence to control how strictly results are filtered: 'high' when verifying a specific fact so weak matches are dropped, 'medium' for normal questions, omit it for broad exploration. If a high-confidence search returns nothing, retry the same query at a lower confidence before concluding the documents lack the answer.
- If a search returns nothing useful, retry the same query with a different searchType before rewording the query or giving up.
- Every search result includes its documentId, its position (chunk number in document reading order), and the document's totalChunks. When the read_chunks tool is available, use those values to read the chunks surrounding a relevant result for fuller context instead of re-searching with the same query.`,
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
				searchType: {
					type: 'string',
					enum: ['semantic', 'bm25', 'hybrid'],
					description:
						"Retrieval method. 'semantic': embedding similarity search — matches by meaning even when wording differs; best for conceptual questions, paraphrases, and descriptions. 'bm25': exact keyword full-text matching — best for proper names, acronyms, codes, IDs, error strings, and exact phrases that must appear literally. 'hybrid': runs both and reranks the merged results; the best default when unsure. Omit to use the user's configured method."
				},
				top_k: {
					type: 'integer',
					minimum: 1,
					maximum: 20,
					description: 'Optional number of chunks. Defaults to the configured search limit.'
				},
				confidence: {
					type: 'string',
					enum: ['low', 'medium', 'high'],
					description:
						"Optional minimum relevance filter. 'high' keeps only strong matches — use it when verifying a specific fact. 'medium' balances precision and recall. Omit or use 'low' to see every candidate result."
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

		let requestedType = '';
		if (typeof args.searchType === 'string') {
			requestedType = args.searchType;
		} else if (typeof args.mode === 'string') {
			requestedType = args.mode;
		}
		const mode: SearchMode = SEARCH_MODES.has(requestedType as SearchMode)
			? (requestedType as SearchMode)
			: (context.retrievalMode ?? DEFAULT_ASSISTANT_CONFIG.retrievalMode);
		const maxTopK = clampInteger(context.maxSearchTopK, 1, 100, 20);
		const topK = clampInteger(
			args.top_k ?? context.ragTopK,
			1,
			maxTopK,
			DEFAULT_ASSISTANT_CONFIG.ragTopK
		);
		const documentIds = context.documentIds;
		const confidence = SEARCH_CONFIDENCE_LEVELS.includes(args.confidence as SearchConfidence)
			? (args.confidence as SearchConfidence)
			: undefined;

		if (mode === 'all') {
			const data = await searchAllMethods({ query, topK, documentIds });

			const positions = await getChunkPositions(data.hybrid);
			const sources = buildSources(data.hybrid, positions);
			return createToolResult(data, {
				outputs: sources.map(sourceOutput)
			});
		}

		const result = await retrieveRagContext({
			question: query,
			documentIds,
			mode,
			topK,
			confidence
		});
		let emptyMessage = 'No relevant document chunks found.';
		if (confidence && confidence !== 'low') {
			emptyMessage = `No document chunks met the ${confidence} confidence threshold. Retry with a lower confidence or a different query before concluding the documents lack the answer.`;
		}
		const data = {
			query,
			searchType: result.mode,
			...(confidence ? { confidence } : {}),
			context: result.contextBlock || emptyMessage,
			sources: result.sources
		};

		return createToolResult(data, {
			outputs: result.sources.map(sourceOutput)
		});
	}
};
