// PathRAG explores short entity/chunk paths and returns the strongest relational chains.

import { GraphStore } from "./graph-store";
import type { GraphEdge, GraphNode, KnowledgeGraphPath } from "./types";
import { graphId, queryTerms, tokenize, unique } from "./utils";

const STRONG_RELATIONS = new Set([
  "TREATS", "USES", "HAS_STEP", "HAS_COMPONENT", "DETECTS", "OBSERVES",
]);

export function pathRagSearch(
  query: string,
  graph: GraphStore,
  seedChunkIds: string[],
  maxDepth = 3,
  topK = 12,
): KnowledgeGraphPath[] {
  const terms = queryTerms(query);
  const seeds = new Set(
    seedChunkIds.slice(0, 6).map((chunkId) => graphId("chunk", chunkId)),
  );

  for (const node of graph.nodes.values()) {
    if (node.kind !== "entity") continue;
    if (tokenize(node.label).some((term) => terms.includes(term))) seeds.add(node.id);
  }

  const paths: KnowledgeGraphPath[] = [];
  for (const seed of seeds) {
    walk(graph, seed, [], [], maxDepth, paths, terms);
  }

  const seen = new Set<string>();
  return paths
    .sort((left, right) => right.score - left.score)
    .filter((path) => {
      const key = path.nodes.map((node) => node.id).join(">");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, topK);
}

function walk(
  graph: GraphStore,
  currentId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  depthLeft: number,
  output: KnowledgeGraphPath[],
  terms: string[],
): void {
  const current = graph.getNode(currentId);
  if (!current) return;
  const nextNodes = [...nodes, current];

  if (edges.length) {
    output.push({
      nodes: nextNodes,
      edges,
      score: scorePath(nextNodes, edges, terms),
      chunkIds: unique(edges.flatMap((edge) => edge.chunkId ? [edge.chunkId] : [])),
    });
  }
  if (depthLeft === 0) return;

  // Document containment links connect every chunk in a manual and create noisy shortcuts,
  // so PathRAG traverses only chunk/entity evidence and typed entity relationships.
  const neighbors = graph
    .neighbors(currentId)
    .filter(({ node, edge }) => node.kind !== "document" && edge.relation !== "CONTAINS")
    .sort((left, right) => right.edge.weight - left.edge.weight)
    .slice(0, 12);

  for (const { node, edge } of neighbors) {
    if (nextNodes.some((existing) => existing.id === node.id)) continue;
    walk(graph, node.id, nextNodes, [...edges, edge], depthLeft - 1, output, terms);
  }
}

function scorePath(nodes: GraphNode[], edges: GraphEdge[], terms: string[]): number {
  const text = nodes.map((node) => node.label.toLowerCase()).join(" ");
  let score = terms.reduce((sum, term) => sum + (text.includes(term) ? 2 : 0), 0);

  for (const edge of edges) {
    score += edge.weight;
    if (STRONG_RELATIONS.has(edge.relation)) score += 3;
  }

  return score + 1 / Math.max(1, nodes.length);
}
