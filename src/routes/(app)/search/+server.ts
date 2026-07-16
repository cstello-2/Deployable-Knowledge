import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  KnowledgeGraphNoDocumentsError,
  KnowledgeGraphNotBuiltError,
  searchKnowledgeGraph,
  type KnowledgeGraphStatus,
} from "$lib/server/knowledge-graph";
import { searchAllMethods } from "$lib/server/rag/search/hybrid-search";

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get("query") ?? "";
  const topK = Math.max(1, parseInt(url.searchParams.get("topK") ?? "8", 10));
  const documentIds = url.searchParams.getAll("documentIds");
  const docs = documentIds.length ? documentIds : undefined;

  if (!query.trim()) {
    return json({
      bm25: [],
      semantic: [],
      hybrid: [],
      graph: [],
      graphStatus: null,
    });
  }

  const options = { query, topK, documentIds: docs };
  const graphSearch = searchKnowledgeGraph(options)
    .then((result) => ({
      results: result.results,
      status: null as KnowledgeGraphStatus | null,
    }))
    .catch((error: unknown) => {
      if (
        error instanceof KnowledgeGraphNotBuiltError ||
        error instanceof KnowledgeGraphNoDocumentsError
      ) {
        return { results: [], status: error.graphStatus };
      }
      throw error;
    });

  const [results, graph] = await Promise.all([
    searchAllMethods(options),
    graphSearch,
  ]);

  return json({
    bm25: results.bm25,
    semantic: results.semantic,
    hybrid: results.hybrid,
    graph: graph.results,
    graphStatus: graph.status,
  });
};
