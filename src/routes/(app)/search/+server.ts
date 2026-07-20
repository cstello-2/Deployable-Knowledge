import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { toolRegistry } from "$lib/server/tools";

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get("query") ?? "";
  const topK = Math.max(1, parseInt(url.searchParams.get("topK") ?? "8", 10));
  const documentIds = url.searchParams.getAll("documentIds");
  const docs = documentIds.length ? documentIds : undefined;

  if (!query.trim()) {
    return json({ bm25: [], semantic: [], hybrid: [] });
  }

  const result = await toolRegistry.execute(
    "search",
    { query, top_k: topK, mode: "all" },
    { documentIds: docs, maxSearchTopK: 100 },
  );

  if (result.isError) {
    return json(JSON.parse(result.content), { status: 400 });
  }

  return json(result.data);
};
