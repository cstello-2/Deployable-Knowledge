import { json } from "@sveltejs/kit";
import { desc, inArray, sql } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/database/database";
import { document_chunks, documents, graph_edges, graph_nodes } from "$lib/server/database/schema";
import { extractWithTypeScript } from "$lib/server/knowledge-graph/typescript-extractor";
import type { GraphNode, RelationType } from "$lib/server/knowledge-graph/types";
import { graphId, sanitizeEntityLabel } from "$lib/server/knowledge-graph/utils";
import { searchHybrid } from "$lib/server/rag/search/hybrid-search";

type VisualNode = {
  id: string;
  label: string;
  kind: GraphNode["kind"];
  entityKind?: string;
  documentId?: string;
  chunkId?: string;
  score?: number;
  preview?: string;
};

type VisualEdge = {
  source: string;
  target: string;
  relation: RelationType;
  weight: number;
  evidence?: string;
};

type VisualChunk = {
  chunkId: string;
  documentId: string;
  sourceTitle: string;
  pageIndex: number;
  chunkIndex: number;
  content: string;
  score?: number;
};

const MAX_QUERY_CHUNKS = 10;
const MAX_OVERVIEW_DOCUMENTS = 40;
const MAX_OVERVIEW_CHUNKS = 60;
const MAX_ENTITIES_PER_CHUNK = 10;
const MAX_VISIBLE_NODES = 120;
const MAX_VISIBLE_EDGES = 220;
const MAX_EVIDENCE_CHARS = 220;

export const GET: RequestHandler = async ({ url }) => {
  const query = (url.searchParams.get("query") ?? "").trim();
  const topK = Math.max(1, Math.min(20, parseInt(url.searchParams.get("topK") ?? "8", 10)));
  const documentIds = url.searchParams.getAll("documentIds").filter(Boolean);

  if (query) {
    return json(await createQueryVisual(query, topK, documentIds));
  }

  return json(await createOverviewVisual(documentIds));
};

async function createQueryVisual(
  query: string,
  topK: number,
  documentIds: string[],
) {
  const search = await searchHybrid({
    query,
    topK: Math.min(MAX_QUERY_CHUNKS, Math.max(topK * 2, 6)),
    documentIds: documentIds.length ? documentIds : undefined,
  });
  const chunks = search.results.slice(0, MAX_QUERY_CHUNKS).map((match, index) => ({
    chunkId: match.chunkId,
    documentId: match.documentId,
    sourceTitle: match.sourceTitle,
    pageIndex: match.pageIndex,
    chunkIndex: match.chunkIndex,
    content: match.content,
    score: 1 / (index + 1),
  }));
  const visual = await buildVisualFromChunks(chunks);

  return {
    query,
    mode: "query",
    stats: { nodes: visual.nodes.length, edges: visual.edges.length },
    ...visual,
    summary: `Focused graph built from the top retrieved chunks for "${query}"`,
  };
}

async function createOverviewVisual(documentIds: string[]) {
  const storedVisual = await createStoredOverviewVisual(documentIds);
  if (storedVisual) {
    return storedVisual;
  }

  const documentRows = documentIds.length
    ? await db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(inArray(documents.id, documentIds))
        .limit(MAX_OVERVIEW_DOCUMENTS)
    : await db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .orderBy(desc(documents.updatedAt))
        .limit(MAX_OVERVIEW_DOCUMENTS);
  const selectedDocumentIds = documentRows.map((document) => document.id);

  const chunkRows = selectedDocumentIds.length
    ? await db
        .select({
          chunkId: document_chunks.id,
          documentId: document_chunks.documentId,
          sourceTitle: documents.title,
          pageIndex: document_chunks.pageIndex,
          chunkIndex: document_chunks.chunkIndex,
          content: document_chunks.content,
        })
        .from(document_chunks)
        .innerJoin(documents, sql`${documents.id} = ${document_chunks.documentId}`)
        .where(inArray(document_chunks.documentId, selectedDocumentIds))
        .orderBy(desc(document_chunks.createdAt))
        .limit(MAX_OVERVIEW_CHUNKS)
    : [];
  const visual = await buildVisualFromChunks(
    chunkRows.map((chunk, index) => ({
      ...chunk,
      pageIndex: Number(chunk.pageIndex),
      chunkIndex: Number(chunk.chunkIndex),
      score: 1 / (index + 1),
    })),
    documentRows,
  );

  return {
    query: "",
    mode: "overview",
    stats: { nodes: visual.nodes.length, edges: visual.edges.length },
    ...visual,
    summary: "Fast overview sample of documents, chunks, and extracted entity nodes",
  };
}

async function createStoredOverviewVisual(documentIds: string[]) {
  const nodeRows = documentIds.length
    ? await db
        .select()
        .from(graph_nodes)
        .where(inArray(graph_nodes.documentId, documentIds))
        .limit(MAX_VISIBLE_NODES)
    : await db
        .select()
        .from(graph_nodes)
        .orderBy(desc(graph_nodes.updatedAt))
        .limit(MAX_VISIBLE_NODES);

  if (nodeRows.length === 0) return null;

  const selected = new Set(nodeRows.map((node) => node.id));
  const edgeRows = documentIds.length
    ? await db
        .select()
        .from(graph_edges)
        .where(inArray(graph_edges.documentId, documentIds))
        .limit(MAX_VISIBLE_EDGES)
    : await db.select().from(graph_edges).limit(MAX_VISIBLE_EDGES);

  return {
    query: "",
    mode: "overview",
    stats: { nodes: nodeRows.length, edges: edgeRows.length },
    nodes: nodeRows.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      entityKind: node.entityKind ?? undefined,
      documentId: node.documentId ?? undefined,
      chunkId: node.chunkId ?? undefined,
    })),
    edges: edgeRows
      .filter((edge) => selected.has(edge.source) && selected.has(edge.target))
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        relation: edge.relation,
        weight: Number(edge.weight),
        evidence: truncate(edge.evidence),
      })),
    summary: "Stored Knowledge Graph triplets from ingested chunks",
  };
}

async function buildVisualFromChunks(
  chunks: VisualChunk[],
  documentRows: Array<{ id: string; title: string }> = [],
) {
  const nodes = new Map<string, VisualNode>();
  const edges = new Map<string, VisualEdge>();

  const addNode = (node: VisualNode) => {
    const existing = nodes.get(node.id);
    nodes.set(node.id, {
      ...existing,
      ...node,
      entityKind: preferEntityKind(existing?.entityKind, node.entityKind),
      score: Math.max(existing?.score ?? 0, node.score ?? 0) || undefined,
      preview: node.preview ?? existing?.preview,
    });
  };
  const addEdge = (edge: VisualEdge) => {
    if (edge.source === edge.target) return;
    const key = `${edge.source}\u0000${edge.target}\u0000${edge.relation}`;
    const existing = edges.get(key);
    edges.set(key, {
      ...edge,
      weight: Math.max(existing?.weight ?? 0, edge.weight),
      evidence: truncate(edge.evidence ?? existing?.evidence),
    });
  };

  for (const document of documentRows) {
    addNode({
      id: graphId("document", document.id),
      label: document.title,
      kind: "document",
      documentId: document.id,
      score: 1,
    });
  }

  for (const chunk of chunks) {
    const documentNodeId = graphId("document", chunk.documentId);
    const chunkNodeId = graphId("chunk", chunk.chunkId);
    addNode({
      id: documentNodeId,
      label: chunk.sourceTitle,
      kind: "document",
      documentId: chunk.documentId,
      score: chunk.score,
    });
    addNode({
      id: chunkNodeId,
      label: `${chunk.sourceTitle} page ${chunk.pageIndex + 1}`,
      kind: "chunk",
      documentId: chunk.documentId,
      chunkId: chunk.chunkId,
      score: chunk.score,
      preview: truncate(chunk.content),
    });
    addEdge({
      source: documentNodeId,
      target: chunkNodeId,
      relation: "CONTAINS",
      weight: 0.5,
      evidence: chunk.content,
    });

    const { entities, relations } = extractWithTypeScript(chunk.content, [], chunk.chunkId);
    const kindByLabel = new Map(
      entities.map((entity) => [sanitizeEntityLabel(entity.label).toLowerCase(), entity.kind]),
    );
    for (const entity of entities.slice(0, MAX_ENTITIES_PER_CHUNK)) {
      const label = sanitizeEntityLabel(entity.label);
      if (!label) continue;
      const entityNodeId = graphId("entity", label);
      addNode({
        id: entityNodeId,
        label,
        kind: "entity",
        entityKind: entity.kind,
        score: chunk.score,
      });
      addEdge({
        source: chunkNodeId,
        target: entityNodeId,
        relation: "MENTIONS",
        weight: 1,
        evidence: chunk.content,
      });
    }

    for (const relation of relations) {
      const sourceLabel = sanitizeEntityLabel(relation.source);
      const targetLabel = sanitizeEntityLabel(relation.target);
      if (!sourceLabel || !targetLabel) continue;
      const source = graphId("entity", sourceLabel);
      const target = graphId("entity", targetLabel);
      addNode({ id: source, label: sourceLabel, kind: "entity", entityKind: kindByLabel.get(sourceLabel.toLowerCase()) ?? "concept", score: chunk.score });
      addNode({ id: target, label: targetLabel, kind: "entity", entityKind: kindByLabel.get(targetLabel.toLowerCase()) ?? "concept", score: chunk.score });
      addEdge({
        source,
        target,
        relation: relation.relation || "RELATED_TO",
        weight: 1,
        evidence: relation.evidence ?? chunk.content,
      });
    }
  }

  const selectedNodes = [...nodes.values()].slice(0, MAX_VISIBLE_NODES);
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
  const selectedEdges = [...edges.values()]
    .filter((edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target))
    .slice(0, MAX_VISIBLE_EDGES);

  return {
    nodes: selectedNodes,
    edges: selectedEdges,
  };
}

function truncate(value = "") {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > MAX_EVIDENCE_CHARS
    ? `${compact.slice(0, MAX_EVIDENCE_CHARS).trimEnd()}...`
    : compact;
}

function preferEntityKind(existing?: string, next?: string): string | undefined {
  if (!existing || existing === "unknown" || existing === "concept") return next ?? existing;
  if (!next || next === "unknown" || next === "concept") return existing;
  return existing;
}
