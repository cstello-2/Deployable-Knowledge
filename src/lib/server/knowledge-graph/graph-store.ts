// GraphStore keeps fast adjacency lists so LightRAG and PathRAG do not scan every edge.

import type { GraphEdge, GraphNode, RelationType } from "./types";

export class GraphStore {
  readonly nodes = new Map<string, GraphNode>();
  readonly edges: GraphEdge[] = [];
  private readonly edgeKeys = new Set<string>();
  private readonly adjacency = new Map<string, Array<{ nodeId: string; edge: GraphEdge }>>();

  addNode(node: GraphNode): void {
    if (!this.nodes.has(node.id)) this.nodes.set(node.id, node);
  }

  addEdge(edge: GraphEdge): void {
    if (edge.source === edge.target) return;

    // Chunk ID is part of the key because the same relation may be supported by many chunks.
    const key = [edge.source, edge.target, edge.relation, edge.chunkId ?? ""].join("\u0000");
    if (this.edgeKeys.has(key)) return;

    this.edgeKeys.add(key);
    this.edges.push(edge);
    this.addAdjacent(edge.source, edge.target, edge);
    this.addAdjacent(edge.target, edge.source, edge);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  neighbors(
    id: string,
    relations?: readonly RelationType[],
  ): Array<{ node: GraphNode; edge: GraphEdge }> {
    const output: Array<{ node: GraphNode; edge: GraphEdge }> = [];

    for (const adjacent of this.adjacency.get(id) ?? []) {
      if (relations && !relations.includes(adjacent.edge.relation)) continue;
      const node = this.nodes.get(adjacent.nodeId);
      if (node) output.push({ node, edge: adjacent.edge });
    }

    return output;
  }

  stats(): { nodes: number; edges: number } {
    return { nodes: this.nodes.size, edges: this.edges.length };
  }

  private addAdjacent(source: string, nodeId: string, edge: GraphEdge): void {
    const entries = this.adjacency.get(source) ?? [];
    entries.push({ nodeId, edge });
    this.adjacency.set(source, entries);
  }
}
