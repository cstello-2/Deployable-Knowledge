import { searchSemantic } from "./semantic-search";
import {
  searchHybrid,
  withRelevanceScores,
} from "./hybrid-search";
import { searchBm25 } from "./bm25-search";
import type {
  RelevanceSearchMatch,
  SearchChunkType,
} from "./search-shared";

const DEFAULT_RAG_TOP_K = 5; // Now adjustable in Search Window Settings
const MAX_CONTEXT_CHARS = 1200; // Same as max chunk size for now
const MAX_PREVIEW_CHARS = 200;
const DEFAULT_RETRIEVAL_MODE =
  process.env.RAG_RETRIEVAL_MODE === "bm25" ? "bm25" :
  process.env.RAG_RETRIEVAL_MODE === "semantic" ? "semantic" : "hybrid"; // Now adjustable in Search Window Settings

export type RagRetrievalMode = "semantic" | "bm25" | "hybrid";

export type RagSource = {
  title: string;
  description: string;
  documentId: string;
  chunkId: string;
  pageIndex: number;
  chunkIndex: number;
  relevanceScore: number;
};

export type RagContextResult = {
  mode: RagRetrievalMode;
  contextBlock: string;
  sources: RagSource[];
};

// The prompt gets compact text only. Full chunk content stays in storage/search results
function compactText(text: string, limit: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit).trimEnd()}...`;
}

// Format retrieved chunks in the old RAG prompt style
function formatContext(matches: RelevanceSearchMatch[]) {
  if (matches.length === 0) return "";

  const items = matches.map((match) => {
    const content = compactText(match.content, MAX_CONTEXT_CHARS);
    const source = match.sourceTitle || match.sourcePath || "unknown";

    return `- ${content} (source: ${source})`;
  });

  return ["Relevant context:", ...items].join("\n");
}

// Sources are the user-facing citation list, so keep them shorter than the model context
function buildSources(matches: RelevanceSearchMatch[]): RagSource[] {
  return matches.map((match) => ({
    title: match.sourceTitle,
    description: `Page ${match.pageIndex + 1}: ${compactText(match.content, MAX_PREVIEW_CHARS)}`,
    documentId: match.documentId,
    chunkId: match.chunkId,
    pageIndex: match.pageIndex,
    chunkIndex: match.chunkIndex,
    relevanceScore: match.relevanceScore,
  }));
}

// Chat uses hybrid by default. Set RAG_RETRIEVAL_MODE=semantic / bm25 to force one path
// May want to switch to hybrid only in the future, kept for now to test/validate
export async function retrieveRagContext({
  question,
  documentIds = [],
  chunkTypes = ["TEXT", "TABLE", "IMAGE"],
  topK = DEFAULT_RAG_TOP_K,
  mode = DEFAULT_RETRIEVAL_MODE,
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
    chunkTypes,
  };
  let matches: RelevanceSearchMatch[];

  if (mode === "bm25") {
    const search = await searchBm25(searchOptions);
    matches = (await withRelevanceScores(question, [], search.results)).bm25;
  } else if (mode === "hybrid") {
    matches = (await searchHybrid(searchOptions)).results;
  } else {
    const search = await searchSemantic(searchOptions);
    matches = (await withRelevanceScores(question, search.results)).semantic;
  }

  return {
    mode,
    contextBlock: formatContext(matches),
    sources: buildSources(matches),
  };
}
