import { json, error } from "@sveltejs/kit";
import { retrieveRagContext } from "$lib/server/rag/retrieve-rag-context";
import type { SemanticSearchChunkType } from "$lib/server/rag/semantic-search";
import type { RequestHandler } from "./$types";

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

export const GET: RequestHandler = async ({ url }) => {
  const query = (url.searchParams.get("q") ?? url.searchParams.get("query") ?? "").trim();

  if (!query) {
    throw error(400, "Pass a query with ?q=your question.");
  }

  const result = await retrieveRagContext({
    question: query,
    topK: readTopK(url.searchParams),
    documentIds: readList(url.searchParams, "documentId").concat(
      readList(url.searchParams, "document_id"),
    ),
    chunkTypes: readChunkTypes(url.searchParams),
  });

  return json({
    query,
    mode: "semantic",
    contextBlock: result.contextBlock,
    sources: result.sources,
    timings: result.timings,
    matches: result.matches.map((match) => ({
      chunkId: match.chunkId,
      documentId: match.documentId,
      sourceTitle: match.sourceTitle,
      sourcePath: match.sourcePath,
      pageIndex: match.pageIndex,
      pageNumber: match.pageIndex + 1,
      chunkIndex: match.chunkIndex,
      chunkType: match.chunkType,
      score: match.score,
      content: match.content,
    })),
  });
};
