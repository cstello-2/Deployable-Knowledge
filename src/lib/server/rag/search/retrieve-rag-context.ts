import { searchSemantic } from "./semantic-search";
import {
  searchHybrid,
} from "./hybrid-search";
import { searchBm25 } from "./bm25-search";
import type {
  SearchChunkType,
  SearchMatchBase,
} from "./search-shared";
import type { Document } from "$lib/server/database/schema";
import {
  searchKnowledgeGraph,
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

export function resolveRagRetrievalMode(
  ...candidates: unknown[]
): RagRetrievalMode {
  for (const candidate of candidates) {
    if (
      candidate === "semantic" ||
      candidate === "bm25" ||
      candidate === "hybrid" ||
      candidate === "graph"
    ) {
      return candidate;
    }
  }
  return "hybrid";
}
type RagMatch = SearchMatchBase & { score?: number };

export type RagSource = {
  title: string;
  description: string;
  documentId: string;
  sourceType: Document["sourceType"];
  chunkId: string;
  pageIndex: number;
  chunkIndex: number;
  score: number;
  rawScore?: number;
  content: string;
  sourceTitle: string;
  chunkType: SearchChunkType;
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
function buildSources(matches: RagMatch[], mode: RagRetrievalMode): RagSource[] {
  const hasExplicitScores = matches.some((match) => Number.isFinite(match.score));
  const rawScores = matches.map((match, index) =>
    Number.isFinite(match.score)
      ? match.score!
      : hasExplicitScores
        ? 0
        : matches.length === 1
          ? 1
          : 1 - index / Math.max(1, matches.length - 1),
  );
  const maximumBm25Score = Math.max(0, ...rawScores);

  return matches.map((match, index) => ({
    title: match.sourceTitle,
    description: `Page ${match.pageIndex + 1}: ${compactText(match.content, MAX_PREVIEW_CHARS)}`,
    documentId: match.documentId,
    sourceType: match.sourceType,
    chunkId: match.chunkId,
    pageIndex: match.pageIndex,
    chunkIndex: match.chunkIndex,
    // Citation scores always use a [0, 1] UI contract. BM25 is unbounded, so
    // it is normalized relative to the strongest returned result.
    score: mode === "bm25"
      ? maximumBm25Score > 0
        ? clamp01(rawScores[index] / maximumBm25Score)
        : 0
      : clamp01(rawScores[index]),
    rawScore: mode === "bm25" ? rawScores[index] : undefined,
    content: match.content,
    sourceTitle: match.sourceTitle,
    chunkType: match.chunkType,
  }));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function formatGraphPaths(paths: KnowledgeGraphPath[]): string {
  if (!paths.length) return "";

  const lines = paths.slice(0, 8).flatMap((path, index) => {
    const chain = path.nodes.map((node, nodeIndex) => {
      if (nodeIndex === 0) return node.label;
      const relation = path.edges[nodeIndex - 1]?.relation ?? "RELATED_TO";
      return `--${relation}--> ${node.label}`;
    }).join(" ");

    const evidence = path.edges
      .map((edge) => compactText(edge.evidence, 260))
      .filter(Boolean)
      .slice(0, 2);

    return [
      `[Path ${index + 1}] ${chain}`,
      ...evidence.map((item) => `  evidence: ${item}`),
    ];
  });

  return [
    "Retrieved knowledge-graph paths and relationship evidence:",
    "",
    ...lines,
  ].join("\n");
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
      sources: buildSources(search.results, mode),
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
      sources: buildSources(search.results, mode),
    };
  }

  if (mode === "graph") {
    const search = await searchKnowledgeGraph({
      query: question,
      topK: Math.max(topK, 8),
      documentIds,
      chunkTypes,
    });

    return {
      mode,
      contextBlock: [
        "Use the retrieved chunks plus the graph paths below. Explain the answer with the relationship evidence when it helps, not just the shortest fact.",
        formatContext(search.results),
        formatGraphPaths(search.paths),
      ].filter(Boolean).join("\n\n"),
      sources: buildSources(search.results.slice(0, topK), mode),
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
    sources: buildSources(search.results, mode),
  };
}
