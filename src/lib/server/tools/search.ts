import { searchAllMethods } from "../rag/search/hybrid-search";
import {
  retrieveRagContext,
  type RagRetrievalMode,
  type RagSource,
} from "../rag/search/retrieve-rag-context";
import type { SearchMatchBase } from "../rag/search/search-shared";
import type { AgentTool } from "./types";
import { createToolResult, sourceOutput } from "./result";
import {
  clampInteger,
  clampText,
  compactText,
  readObject,
} from "../utils/values";

type SearchMode = RagRetrievalMode | "all";

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
  "semantic",
  "bm25",
  "hybrid",
  "all",
]);

export const searchTool: AgentTool<SearchToolData> = {
  definition: {
    type: "function",
    function: {
      name: "search",
      description:
        "Search the user's local document knowledge base and return relevant source chunks. You MUST use this before answering document-related factual questions or saying that you do not know, lack context, cannot find an answer, or need more information. If results are insufficient, refine the query and call search again.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A focused standalone search query. Preserve important names and technical terms.",
          },
          mode: {
            type: "string",
            enum: ["semantic", "bm25", "hybrid"],
            description:
              "Optional retrieval method. Defaults to the configured method.",
          },
          top_k: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            description:
              "Optional number of chunks. Defaults to the configured search limit.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },

  async execute(argumentsValue, context) {
    const args = readObject(argumentsValue);
    const query = clampText(args.query, 2_000);

    if (!query) throw new Error("search requires a non-empty query");

    const requestedMode = typeof args.mode === "string" ? args.mode : "";
    const mode: SearchMode = SEARCH_MODES.has(requestedMode as SearchMode)
      ? (requestedMode as SearchMode)
      : (context.retrievalMode ?? "hybrid");
    const maxTopK = clampInteger(context.maxSearchTopK, 1, 100, 20);
    const topK = clampInteger(args.top_k ?? context.ragTopK, 1, maxTopK, 5);
    const documentIds = context.documentIds;

    if (mode === "all") {
      const data = await searchAllMethods({ query, topK, documentIds });

      const sources = buildSources(data.hybrid);
      return createToolResult(data, {
        outputs: sources.map(sourceOutput),
      });
    }

    const result = await retrieveRagContext({
      question: query,
      documentIds,
      mode,
      topK,
    });
    const data = {
      query,
      mode: result.mode,
      context: result.contextBlock || "No relevant document chunks found.",
      sources: result.sources,
    };

    return createToolResult(data, {
      outputs: result.sources.map(sourceOutput),
    });
  },
};

function buildSources(matches: SearchMatchBase[]): RagSource[] {
  return matches.map((match) => ({
    title: match.sourceTitle,
    description: `Page ${match.pageIndex + 1}: ${compactText(match.content, 200)}`,
    documentId: match.documentId,
    chunkId: match.chunkId,
    pageIndex: match.pageIndex,
    chunkIndex: match.chunkIndex,
  }));
}
