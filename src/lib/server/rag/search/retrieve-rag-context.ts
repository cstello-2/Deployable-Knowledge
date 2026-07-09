import {
  searchSemantic,
  type SemanticSearchMatch,
} from "./semantic-search";
import {
  searchHybrid,
  type HybridSearchMatch,
} from "./hybrid-search";
import {
  searchBm25,
  type Bm25SearchMatch,
} from "./bm25-search";
import type { SearchChunkType } from "./search-shared";
import {
  searchKnowledgeGraph,
  type KnowledgeGraphMatch,
  type KnowledgeGraphPath,
} from "$lib/server/knowledge-graph";

const DEFAULT_RAG_TOP_K = 5; // Now adjustable in Assistant Settings
const MAX_CONTEXT_CHARS = 1200; // Same as max chunk size for now
const MAX_PREVIEW_CHARS = 200;
const DEFAULT_RETRIEVAL_MODE =
  process.env.RAG_RETRIEVAL_MODE === "bm25" ? "bm25" :
  process.env.RAG_RETRIEVAL_MODE === "semantic" ? "semantic" :
  process.env.RAG_RETRIEVAL_MODE === "graph" ? "graph" : "hybrid";

export type RagRetrievalMode = "semantic" | "bm25" | "hybrid" | "graph";
type RagMatch = SemanticSearchMatch | Bm25SearchMatch | HybridSearchMatch | KnowledgeGraphMatch;

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
};

// The prompt gets compact text only. Full chunk content stays in storage/search results
function compactText(text: string, limit: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit).trimEnd()}...`;
}

// Format retrieved chunks in the old RAG prompt style
function formatContext(matches: RagMatch[]) {
  if (matches.length === 0) return "";

  const items = matches.map((match) => {
    const content = compactText(match.content, MAX_CONTEXT_CHARS);
    const source = match.sourceTitle || match.sourcePath || "unknown";

    return `- ${content} (source: ${source})`;
  });

  return ["Relevant context:", ...items].join("\n");
}

// Sources are the user-facing citation list, so keep them shorter than the model context
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

function formatGraphPaths(paths: KnowledgeGraphPath[]): string {
  if (!paths.length) return "";

  const lines = paths.slice(0, 5).map((path, index) => {
    const chain = path.nodes.map((node, nodeIndex) => {
      if (nodeIndex === 0) return node.label;
      const relation = path.edges[nodeIndex - 1]?.relation ?? "RELATED_TO";
      return `--${relation}--> ${node.label}`;
    }).join(" ");

    return `[Path ${index + 1}] ${chain}`;
  });

  return ["Retrieved knowledge-graph paths:", "", ...lines].join("\n");
}

// Chat uses hybrid by default. Set RAG_RETRIEVAL_MODE=semantic / bm25 / graph to force one path
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
  // Keep each branch explicit so it is easy to see exactly which retriever is running
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
    };
  }

  if (mode === "graph") {
    const search = await searchKnowledgeGraph({
      query: question,
      topK,
      documentIds,
      chunkTypes,
    });

    return {
      mode,
      contextBlock: [
        formatContext(search.results),
        formatGraphPaths(search.paths),
      ].filter(Boolean).join("\n\n"),
      sources: buildSources(search.results),
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
  };
}
