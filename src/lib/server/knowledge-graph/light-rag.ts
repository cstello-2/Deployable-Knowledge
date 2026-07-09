// LightRAG starts from hybrid-search chunks and query-matched entities, then gathers
// evidence from their immediate graph neighborhoods.

import { GraphStore } from "./graph-store";
import type { GraphEvidence, RelationType } from "./types";
import { graphId, queryTerms, tokenize, unique } from "./utils";

type EvidenceAccumulator = {
  score: number;
  entities: Set<string>;
  relations: Set<RelationType>;
};

export function lightRagSearch(
  query: string,
  graph: GraphStore,
  seedChunkIds: string[],
): GraphEvidence[] {
  const terms = queryTerms(query);
  const seeds = new Set(seedChunkIds.map((chunkId) => graphId("chunk", chunkId)));
  const evidence = new Map<string, EvidenceAccumulator>();

  // Direct entity-label matches allow graph retrieval to work even when lexical chunk
  // retrieval misses the relationship wording used in the question.
  for (const node of graph.nodes.values()) {
    if (node.kind !== "entity") continue;
    const labelTerms = tokenize(node.label);
    if (labelTerms.some((term) => terms.includes(term))) seeds.add(node.id);
  }

  for (const seedId of seeds) {
    const seed = graph.getNode(seedId);
    if (seed?.chunkId) addEvidence(evidence, seed.chunkId, 2, [], []);

    for (const { node, edge } of graph.neighbors(seedId)) {
      const chunkId = edge.chunkId ?? node.chunkId;
      if (!chunkId) continue;

      const matchedEntities = [seed, node]
        .filter((candidate) => candidate?.kind === "entity")
        .map((candidate) => candidate!.label)
        .filter((label) => tokenize(label).some((term) => terms.includes(term)));
      const queryMatchBonus = matchedEntities.length * 1.5;

      addEvidence(
        evidence,
        chunkId,
        edge.weight + queryMatchBonus,
        matchedEntities,
        [edge.relation],
      );
    }
  }

  return [...evidence.entries()]
    .map(([chunkId, value]) => ({
      chunkId,
      score: value.score,
      matchedEntities: unique([...value.entities]),
      relations: unique([...value.relations]),
    }))
    .sort((left, right) => right.score - left.score);
}

function addEvidence(
  output: Map<string, EvidenceAccumulator>,
  chunkId: string,
  score: number,
  entities: string[],
  relations: RelationType[],
): void {
  const current = output.get(chunkId) ?? {
    score: 0,
    entities: new Set<string>(),
    relations: new Set<RelationType>(),
  };
  current.score += score;
  for (const entity of entities) current.entities.add(entity);
  for (const relation of relations) current.relations.add(relation);
  output.set(chunkId, current);
}
