import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { searchBm25 } from "$lib/server/rag/search/bm25-search";
import { searchSemantic } from "$lib/server/rag/search/semantic-search";
import { searchHybrid } from "$lib/server/rag/search/hybrid-search";
import { searchKnowledgeGraph } from "$lib/server/knowledge-graph";

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get("query") ?? "";
  const topK = Math.max(1, parseInt(url.searchParams.get("topK") ?? "8", 10));
  const documentIds = url.searchParams.getAll("documentIds");
  const docs = documentIds.length ? documentIds : undefined;

  if (!query.trim()) {
    return json({ bm25: [], semantic: [], hybrid: [], graph: [] });
  }

  const opts = { query, topK, documentIds: docs };

  const [bm25, semantic, hybrid, graph] = await Promise.all([
    searchBm25(opts),
    searchSemantic(opts),
    searchHybrid(opts),
    searchKnowledgeGraph(opts),
  ]);

  return json({
    bm25: bm25.results,
    semantic: semantic.results,
    hybrid: hybrid.results,
    graph: graph.results,
  });
};
