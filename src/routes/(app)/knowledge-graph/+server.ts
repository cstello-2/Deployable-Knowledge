import { json } from "@sveltejs/kit";
import {
  KnowledgeGraphNoDocumentsError,
  buildKnowledgeGraph,
  getKnowledgeGraphStatus,
} from "$lib/server/knowledge-graph";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const documentIds = normalizeRequestedDocumentIds(
    url.searchParams.getAll("documentIds"),
  );

  try {
    return json(await getKnowledgeGraphStatus(documentIds));
  } catch (error) {
    return graphLifecycleError(error);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      { code: "INVALID_REQUEST", message: "Knowledge Graph build request must be JSON." },
      { status: 400 },
    );
  }

  if (!isObject(body)) {
    return json(
      { code: "INVALID_REQUEST", message: "Knowledge Graph build request must be an object." },
      { status: 400 },
    );
  }

  const rawDocumentIds = body.documentIds ?? [];
  if (!Array.isArray(rawDocumentIds) || rawDocumentIds.some((id) => typeof id !== "string")) {
    return json(
      { code: "INVALID_DOCUMENT_IDS", message: "documentIds must be an array of strings." },
      { status: 400 },
    );
  }
  if (body.force !== undefined && typeof body.force !== "boolean") {
    return json(
      { code: "INVALID_FORCE", message: "force must be a boolean when provided." },
      { status: 400 },
    );
  }

  const documentIds = normalizeRequestedDocumentIds(rawDocumentIds);
  try {
    const status = await buildKnowledgeGraph(documentIds, { force: body.force === true });
    return json(status, { status: status.status === "failed" ? 500 : 200 });
  } catch (error) {
    return graphLifecycleError(error);
  }
};

function graphLifecycleError(error: unknown): Response {
  if (error instanceof KnowledgeGraphNoDocumentsError) {
    return json(
      {
        code: error.code,
        message: error.message,
        graphStatus: error.graphStatus,
      },
      { status: 404 },
    );
  }

  console.error("Knowledge Graph lifecycle error:", error);
  return json(
    { code: "KNOWLEDGE_GRAPH_ERROR", message: "Knowledge Graph operation failed." },
    { status: 500 },
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequestedDocumentIds(documentIds: readonly string[]): string[] {
  return [...new Set(documentIds.map((id) => id.trim()).filter(Boolean))].sort();
}
