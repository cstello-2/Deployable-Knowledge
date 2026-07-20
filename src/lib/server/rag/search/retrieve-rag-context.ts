import { searchSemantic } from "./semantic-search";
import { searchHybrid } from "./hybrid-search";
import { searchBm25 } from "./bm25-search";
import type {
  SearchChunkType,
  SearchMatchBase,
} from "./search-shared";
import { RAG_CHUNK_CHARACTER_LIMIT } from "$lib/utils/contextLimits";
import { compactText } from "$lib/server/utils/values";

const DEFAULT_RAG_TOP_K = 5; // Now adjustable in Search Window Settings
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
};

export type RagContextResult = {
  mode: RagRetrievalMode;
  contextBlock: string;
  sources: RagSource[];
};

// Format retrieved chunks in the old RAG prompt style
function formatContext(matches: SearchMatchBase[]) {
  if (matches.length === 0) return "";

  const items = matches.map((match) => {
    const content = compactText(match.content, RAG_CHUNK_CHARACTER_LIMIT);
    const source = match.sourceTitle || match.sourcePath || "unknown";

    return `- ${content} (source: ${source})`;
  });

  return ["Relevant context:", ...items].join("\n");
}

// Sources are the user-facing citation list, so keep them shorter than the model context
function buildSources(matches: SearchMatchBase[]): RagSource[] {
  return matches.map((match) => ({
    title: match.sourceTitle,
    description: `Page ${match.pageIndex + 1}: ${compactText(match.content, MAX_PREVIEW_CHARS)}`,
    documentId: match.documentId,
    chunkId: match.chunkId,
    pageIndex: match.pageIndex,
    chunkIndex: match.chunkIndex,
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
  let matches: SearchMatchBase[];

  if (mode === "bm25") {
    const search = await searchBm25(searchOptions);
    matches = search.results.map(({ score: _score, ...match }) => match);
  } else if (mode === "hybrid") {
    matches = (await searchHybrid(searchOptions)).results;
  } else {
    const search = await searchSemantic(searchOptions);
    matches = search.results.map(({ score: _score, ...match }) => match);
  }

  return {
    mode,
    contextBlock: formatContext(matches),
    sources: buildSources(matches),
  };
}
