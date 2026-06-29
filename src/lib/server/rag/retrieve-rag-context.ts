import {
  searchSemantic,
  type SemanticSearchChunkType,
  type SemanticSearchMatch,
  type SemanticSearchTimings,
} from "./semantic-search";
import {
  searchHybrid,
  type HybridSearchMatch,
  type HybridSearchResult,
} from "./hybrid-search";
import {
  searchBm25,
  type Bm25SearchMatch,
  type Bm25SearchResult,
} from "./bm25-search";

const DEFAULT_RAG_TOP_K = 10;
const MAX_CONTEXT_CHARS = 900;
const MAX_PREVIEW_CHARS = 180;
const DEFAULT_RETRIEVAL_MODE =
  process.env.RAG_RETRIEVAL_MODE === "bm25" ? "bm25" :
  process.env.RAG_RETRIEVAL_MODE === "semantic" ? "semantic" : "hybrid";

export type RagRetrievalMode = "semantic" | "bm25" | "hybrid";
type RagMatch = SemanticSearchMatch | Bm25SearchMatch | HybridSearchMatch;

export type RagSource = {
  title: string;
  description: string;
  documentId: string;
  chunkId: string;
  pageIndex: number;
  chunkIndex: number;
  score: number;
};

export type RagContextResult = {
  mode: RagRetrievalMode;
  contextBlock: string;
  sources: RagSource[];
  matches: RagMatch[];
  timings: SemanticSearchTimings | Bm25SearchResult["timings"] | HybridSearchResult["timings"];
};

function compactText(text: string, limit: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit).trimEnd()}...`;
}

function formatContext(matches: RagMatch[]) {
  if (matches.length === 0) return "";

  const sections = matches.map((match, index) => {
    const content = compactText(match.content, MAX_CONTEXT_CHARS);

    return [
      `[${index + 1}] Title: ${match.sourceTitle}`,
      `Page: ${match.pageIndex + 1}`,
      `Chunk: ${match.chunkIndex}`,
      "Content:",
      content,
    ].join("\n");
  });

  return [
    "Retrieved document context:",
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n").trim();
}

function buildSources(matches: RagMatch[]): RagSource[] {
  return matches.map((match) => ({
    title: match.sourceTitle,
    description: `Page ${match.pageIndex + 1}: ${compactText(match.content, MAX_PREVIEW_CHARS)}`,
    documentId: match.documentId,
    chunkId: match.chunkId,
    pageIndex: match.pageIndex,
    chunkIndex: match.chunkIndex,
    score: match.score,
  }));
}

// Chat uses hybrid by default for the POC. Set RAG_RETRIEVAL_MODE=semantic or bm25 to force a specific path.
export async function retrieveRagContext({
  question,
  documentIds = [],
  chunkTypes = ["TEXT", "TABLE"],
  topK = DEFAULT_RAG_TOP_K,
  mode = DEFAULT_RETRIEVAL_MODE,
}: {
  question: string;
  documentIds?: string[];
  chunkTypes?: SemanticSearchChunkType[];
  topK?: number;
  mode?: RagRetrievalMode;
}): Promise<RagContextResult> {
  if (mode === "bm25") {
    const search = await searchBm25({
      query: question,
      topK,
      documentIds,
      chunkTypes,
    });

    return {
      mode,
      contextBlock: formatContext(search.results),
      sources: buildSources(search.results),
      matches: search.results,
      timings: search.timings,
    };
  }

  if (mode === "hybrid") {
    const search = await searchHybrid({
      query: question,
      topK,
      documentIds,
      chunkTypes,
    });

    return {
      mode,
      contextBlock: formatContext(search.results),
      sources: buildSources(search.results),
      matches: search.results,
      timings: search.timings,
    };
  }

  const search = await searchSemantic({
    query: question,
    topK,
    documentIds,
    chunkTypes,
  });

  return {
    mode,
    contextBlock: formatContext(search.results),
    sources: buildSources(search.results),
    matches: search.results,
    timings: search.timings,
  };
}
