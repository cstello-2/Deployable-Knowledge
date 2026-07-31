// PathRAG explores short entity/chunk paths and returns the strongest relational chains.

import { GraphStore } from "./graph-store";
import type { GraphSeedCandidate } from "./seed-selection";
import type { GraphEdge, GraphNode, KnowledgeGraphPath } from "./types";
import { isNoisyEntityLabel, queryTerms, unique } from "./utils";

const STRONG_RELATIONS = new Set([
  "TREATS", "USES", "HAS_STEP", "HAS_COMPONENT", "DETECTS", "OBSERVES",
]);
const MAX_PATH_SEEDS = 10;

export function pathRagSearch(
  query: string,
  graph: GraphStore,
  seedCandidates: readonly GraphSeedCandidate[],
  maxDepth = 3,
  topK = 12,
): KnowledgeGraphPath[] {
  const terms = queryTerms(query);

  const paths: KnowledgeGraphPath[] = [];
  for (const seed of seedCandidates.slice(0, MAX_PATH_SEEDS)) {
    walk(graph, seed.nodeId, [], [], maxDepth, paths, terms, clamp01(seed.score));
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
  seedScore: number,
): void {
  const current = graph.getNode(currentId);
  if (!current) return;
  if (current.kind === "entity" && isNoisyEntityLabel(current.label, current.entityKind)) return;
  const nextNodes = [...nodes, current];

  if (edges.length) {
    output.push({
      nodes: nextNodes,
      edges,
      score: scorePath(nextNodes, edges, terms, seedScore),
      chunkIds: unique(edges.flatMap((edge) => edge.chunkId ? [edge.chunkId] : [])),
    });
  }
  if (depthLeft === 0) return;

  // Document containment links connect every chunk in a manual and create noisy shortcuts,
  // so PathRAG traverses only chunk/entity evidence and typed entity relationships.
  const neighbors = graph
    .neighbors(currentId)
    .filter(({ node, edge }) => node.kind !== "document" && edge.relation !== "CONTAINS")
    .filter(({ node }) => node.kind !== "entity" || !isNoisyEntityLabel(node.label, node.entityKind))
    .sort((left, right) => right.edge.weight - left.edge.weight)
    .slice(0, 12);

  for (const { node, edge } of neighbors) {
    if (nextNodes.some((existing) => existing.id === node.id)) continue;
    walk(
      graph,
      node.id,
      nextNodes,
      [...edges, edge],
      depthLeft - 1,
      output,
      terms,
      seedScore,
    );
  }
}

function scorePath(
  nodes: GraphNode[],
  edges: GraphEdge[],
  terms: string[],
  seedScore: number,
): number {
  const text = nodes.map((node) => node.label.toLowerCase()).join(" ");
  let score = terms.reduce((sum, term) => sum + (text.includes(term) ? 2 : 0), 0);

  for (const edge of edges) {
    score += edge.weight;
    if (STRONG_RELATIONS.has(edge.relation)) score += 3;
  }

  return score + seedScore * 2 + 1 / Math.max(1, nodes.length);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
