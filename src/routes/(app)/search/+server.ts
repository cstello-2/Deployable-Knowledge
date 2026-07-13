import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { searchBm25 } from "$lib/server/rag/search/bm25-search";
import { searchSemantic } from "$lib/server/rag/search/semantic-search";
import { searchHybrid } from "$lib/server/rag/search/hybrid-search";
import {
  KnowledgeGraphNoDocumentsError,
  KnowledgeGraphNotBuiltError,
  searchKnowledgeGraph,
  type KnowledgeGraphStatus,
} from "$lib/server/knowledge-graph";

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get("query") ?? "";
  const topK = Math.max(1, parseInt(url.searchParams.get("topK") ?? "8", 10));
  const documentIds = url.searchParams.getAll("documentIds");
  const docs = documentIds.length ? documentIds : undefined;

  if (!query.trim()) {
    return json({ bm25: [], semantic: [], hybrid: [], graph: [] });
  }

  const opts = { query, topK, documentIds: docs };

  const graphSearch = searchKnowledgeGraph(opts)
    .then((result) => ({ results: result.results, status: null as KnowledgeGraphStatus | null }))
    .catch((error: unknown) => {
      if (
        error instanceof KnowledgeGraphNotBuiltError ||
        error instanceof KnowledgeGraphNoDocumentsError
      ) {
        return { results: [], status: error.graphStatus };
      }
      throw error;
    });

  const [bm25, semantic, hybrid, graph] = await Promise.all([
    searchBm25(opts),
    searchSemantic(opts),
    searchHybrid(opts),
    graphSearch,
  ]);

  return json({
    bm25: bm25.results,
    semantic: semantic.results,
    hybrid: hybrid.results,
    graph: graph.results,
    graphStatus: graph.status,
  });
};
