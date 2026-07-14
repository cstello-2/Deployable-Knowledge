import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { searchAllMethods } from "$lib/server/rag/search/hybrid-search";

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get("query") ?? "";
  const topK = Math.max(1, parseInt(url.searchParams.get("topK") ?? "8", 10));
  const documentIds = url.searchParams.getAll("documentIds");
  const docs = documentIds.length ? documentIds : undefined;

  if (!query.trim()) {
    return json({ bm25: [], semantic: [], hybrid: [] });
  }

  const opts = { query, topK, documentIds: docs };

  const results = await searchAllMethods(opts);
  return json({
    bm25: results.bm25,
    semantic: results.semantic,
    hybrid: results.hybrid,
  });
};
