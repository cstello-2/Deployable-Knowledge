import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { loadKnowledgeGraph } from "$lib/server/knowledge-graph/graph-index";
import { searchKnowledgeGraph } from "$lib/server/knowledge-graph";
import type { GraphEdge, GraphNode, RelationType } from "$lib/server/knowledge-graph/types";
import { graphId } from "$lib/server/knowledge-graph/utils";

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

const MAX_QUERY_NEIGHBORS_PER_CHUNK = 10;
const MAX_OVERVIEW_NODES = 120;
const MAX_OVERVIEW_EDGES = 220;
const MAX_EVIDENCE_CHARS = 220;

export const GET: RequestHandler = async ({ url }) => {
  const query = (url.searchParams.get("query") ?? "").trim();
  const topK = Math.max(1, Math.min(20, parseInt(url.searchParams.get("topK") ?? "8", 10)));
  const documentIds = url.searchParams.getAll("documentIds").filter(Boolean);
  const index = await loadKnowledgeGraph(documentIds);

  if (query) {
    const search = await searchKnowledgeGraph({
      query,
      topK,
      documentIds: documentIds.length ? documentIds : undefined,
    });
    const visual = createQueryGraph(index.graph, query, search.results, search.paths);
    return json({
      query,
      mode: "query",
      stats: index.graph.stats(),
      ...visual,
    });
  }

  return json({
    query,
    mode: "overview",
    stats: index.graph.stats(),
    ...createOverviewGraph(index.graph),
  });
};

function createQueryGraph(
  graph: Awaited<ReturnType<typeof loadKnowledgeGraph>>["graph"],
  query: string,
  results: Array<{
    chunkId: string;
    documentId: string;
    score: number;
    content: string;
  }>,
  paths: Array<{ nodes: GraphNode[]; edges: GraphEdge[] }>,
) {
  const nodes = new Map<string, VisualNode>();
  const edges = new Map<string, VisualEdge>();

  const addNode = (node: GraphNode, score?: number, preview?: string) => {
    const existing = nodes.get(node.id);
    nodes.set(node.id, {
      id: node.id,
      label: node.label,
      kind: node.kind,
      entityKind: node.entityKind,
      documentId: node.documentId,
      chunkId: node.chunkId,
      score: Math.max(existing?.score ?? 0, score ?? 0) || undefined,
      preview: preview ?? existing?.preview,
    });
  };
  const addEdge = (edge: GraphEdge) => {
    const key = `${edge.source}\u0000${edge.target}\u0000${edge.relation}`;
    const existing = edges.get(key);
    edges.set(key, {
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      weight: Math.max(existing?.weight ?? 0, edge.weight),
      evidence: truncate(edge.evidence),
    });
  };

  for (const result of results) {
    const documentNode = graph.getNode(graphId("document", result.documentId));
    const chunkNode = graph.getNode(graphId("chunk", result.chunkId));
    if (documentNode) addNode(documentNode, result.score);
    if (chunkNode) addNode(chunkNode, result.score, truncate(result.content));

    for (const neighbor of graph.neighbors(graphId("chunk", result.chunkId)).slice(0, MAX_QUERY_NEIGHBORS_PER_CHUNK)) {
      addNode(neighbor.node, result.score * Math.max(0.2, neighbor.edge.weight));
      addEdge(neighbor.edge);
    }
  }

  for (const path of paths.slice(0, 12)) {
    for (const node of path.nodes) addNode(node, 0.25);
    for (const edge of path.edges) addEdge(edge);
  }

  // Make sure selected edges only reference selected nodes.
  const selectedEdges = [...edges.values()].filter((edge) =>
    nodes.has(edge.source) && nodes.has(edge.target),
  );

  return {
    nodes: [...nodes.values()],
    edges: selectedEdges,
    summary: `Graph focused around "${query}"`,
  };
}

function createOverviewGraph(graph: Awaited<ReturnType<typeof loadKnowledgeGraph>>["graph"]) {
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + edge.weight);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + edge.weight);
  }

  const allNodes = [...graph.nodes.values()];
  const documents = allNodes.filter((node) => node.kind === "document");
  const topEntities = allNodes
    .filter((node) => node.kind === "entity")
    .sort((left, right) => (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0))
    .slice(0, Math.max(0, MAX_OVERVIEW_NODES - documents.length));
  const selected = new Map<string, VisualNode>();

  for (const node of [...documents, ...topEntities].slice(0, MAX_OVERVIEW_NODES)) {
    selected.set(node.id, {
      id: node.id,
      label: node.label,
      kind: node.kind,
      entityKind: node.entityKind,
      documentId: node.documentId,
      chunkId: node.chunkId,
      score: degree.get(node.id),
    });
  }

  const edges = graph.edges
    .filter((edge) => selected.has(edge.source) && selected.has(edge.target))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, MAX_OVERVIEW_EDGES)
    .map((edge) => ({
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      weight: edge.weight,
      evidence: truncate(edge.evidence),
    }));

  return {
    nodes: [...selected.values()],
    edges,
    summary: "Overview of the strongest document/entity graph clusters",
  };
}

function truncate(value = "") {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > MAX_EVIDENCE_CHARS
    ? `${compact.slice(0, MAX_EVIDENCE_CHARS).trimEnd()}...`
    : compact;
}
