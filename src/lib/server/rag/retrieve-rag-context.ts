import {
  searchSemantic,
  type SemanticSearchChunkType,
  type SemanticSearchMatch,
  type SemanticSearchTimings,
} from "./semantic-search";

const DEFAULT_RAG_TOP_K = 5;
const MAX_CONTEXT_CHARS = 900;
const MAX_PREVIEW_CHARS = 180;

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
  contextBlock: string;
  sources: RagSource[];
  matches: SemanticSearchMatch[];
  timings: SemanticSearchTimings;
};

function compactText(text: string, limit: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit).trimEnd()}...`;
}

function formatContext(matches: SemanticSearchMatch[]) {
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

function buildSources(matches: SemanticSearchMatch[]): RagSource[] {
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

// Semantic-only today, but callers should not care where candidates come from later.
export async function retrieveRagContext({
  question,
  documentIds = [],
  chunkTypes = ["TEXT", "TABLE"],
  topK = DEFAULT_RAG_TOP_K,
}: {
  question: string;
  documentIds?: string[];
  chunkTypes?: SemanticSearchChunkType[];
  topK?: number;
}): Promise<RagContextResult> {
  const search = await searchSemantic({
    query: question,
    topK,
    documentIds,
    chunkTypes,
  });

  return {
    contextBlock: formatContext(search.results),
    sources: buildSources(search.results),
    matches: search.results,
    timings: search.timings,
  };
}
