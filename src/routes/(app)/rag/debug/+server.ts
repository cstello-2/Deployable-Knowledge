import { json, error } from "@sveltejs/kit";
import { retrieveRagContext } from "$lib/server/rag/retrieve-rag-context";
import type { SemanticSearchChunkType } from "$lib/server/rag/semantic-search";
import { searchBm25, type Bm25SearchMatch } from "$lib/server/rag/bm25-search";
import { searchHybrid, type HybridSearchMatch } from "$lib/server/rag/hybrid-search";
import type { RequestHandler } from "./$types";

type DebugMode = "semantic" | "bm25" | "hybrid";
type DebugMatch = Bm25SearchMatch | HybridSearchMatch;

function readList(params: URLSearchParams, key: string) {
  return params
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function readTopK(params: URLSearchParams) {
  const value = Number(params.get("topK") ?? params.get("top_k") ?? "5");
  if (!Number.isFinite(value)) return 5;
  return Math.min(25, Math.max(1, Math.floor(value)));
}

function readChunkTypes(params: URLSearchParams): SemanticSearchChunkType[] {
  const values = readList(params, "chunkType")
    .concat(readList(params, "chunk_type"))
    .map((value) => value.toUpperCase());
  const supported = new Set(["TEXT", "TABLE", "IMAGE"]);

  return values.filter((value): value is SemanticSearchChunkType =>
    supported.has(value),
  );
}

function readMode(params: URLSearchParams): DebugMode {
  const mode = (params.get("mode") ?? "semantic").trim().toLowerCase();

  if (mode === "semantic" || mode === "bm25" || mode === "hybrid") {
    return mode;
  }

  throw error(400, "Unsupported mode. Use semantic, bm25, or hybrid.");
}

function compactText(text: string, limit: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit).trimEnd()}...`;
}

function formatContext(matches: DebugMatch[]) {
  if (matches.length === 0) return "";

  const sections = matches.map((match, index) => [
    `[${index + 1}] Title: ${match.sourceTitle}`,
    `Page: ${match.pageIndex + 1}`,
    `Chunk: ${match.chunkIndex}`,
    "Content:",
    compactText(match.content, 900),
  ].join("\n"));

  return [
    "Retrieved document context:",
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n").trim();
}

function sourcePreview(match: DebugMatch) {
  return {
    title: match.sourceTitle,
    description: `Page ${match.pageIndex + 1}: ${compactText(match.content, 180)}`,
    documentId: match.documentId,
    chunkId: match.chunkId,
    pageIndex: match.pageIndex,
    chunkIndex: match.chunkIndex,
    score: match.score,
  };
}

function debugMatch(match: DebugMatch) {
  return {
    chunkId: match.chunkId,
    documentId: match.documentId,
    sourceTitle: match.sourceTitle,
    sourcePath: match.sourcePath,
    pageIndex: match.pageIndex,
    pageNumber: match.pageIndex + 1,
    chunkIndex: match.chunkIndex,
    chunkType: match.chunkType,
    score: match.score,
    semanticRank: "semanticRank" in match ? match.semanticRank : undefined,
    bm25Rank: "bm25Rank" in match ? match.bm25Rank : undefined,
    semanticScore: "semanticScore" in match ? match.semanticScore : undefined,
    bm25Score: "bm25Score" in match ? match.bm25Score : undefined,
    rerankSemanticScore: "rerankSemanticScore" in match ? match.rerankSemanticScore : undefined,
    rerankBm25Score: "rerankBm25Score" in match ? match.rerankBm25Score : undefined,
    content: match.content,
  };
}

export const GET: RequestHandler = async ({ url }) => {
  const query = (url.searchParams.get("q") ?? url.searchParams.get("query") ?? "").trim();

  if (!query) {
    throw error(400, "Pass a query with ?q=your question.");
  }

  const topK = readTopK(url.searchParams);
  const mode = readMode(url.searchParams);
  const documentIds = readList(url.searchParams, "documentId").concat(
    readList(url.searchParams, "document_id"),
  );
  const chunkTypes = readChunkTypes(url.searchParams);

  if (mode === "semantic") {
    const result = await retrieveRagContext({
      question: query,
      topK,
      documentIds,
      chunkTypes,
      mode: "semantic",
    });

    return json({
      query,
      mode,
      topK,
      documentIds,
      chunkTypes,
      contextBlock: result.contextBlock,
      sources: result.sources,
      timings: result.timings,
      matches: result.matches.map(debugMatch),
    });
  }

  if (mode === "bm25") {
    const result = await searchBm25({
      query,
      topK,
      documentIds,
      chunkTypes,
    });

    return json({
      query,
      mode,
      topK,
      documentIds,
      chunkTypes,
      contextBlock: formatContext(result.results),
      sources: result.results.map(sourcePreview),
      timings: result.timings,
      matches: result.results.map(debugMatch),
    });
  }

  const result = await searchHybrid({
    query,
    topK,
    documentIds,
    chunkTypes,
  });

  return json({
    query,
    mode,
    topK,
    documentIds,
    chunkTypes,
    contextBlock: formatContext(result.results),
    sources: result.results.map(sourcePreview),
    timings: result.timings,
    matches: result.results.map(debugMatch),
  });
};
