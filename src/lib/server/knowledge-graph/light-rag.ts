// LightRAG gathers evidence from the immediate neighborhoods of pre-ranked graph seeds.

import { GraphStore } from "./graph-store";
import type { GraphSeedCandidate } from "./seed-selection";
import type { GraphEvidence, RelationType } from "./types";
import { isNoisyEntityLabel, unique } from "./utils";

type EvidenceAccumulator = {
  score: number;
  entities: Set<string>;
  relations: Set<RelationType>;
};

export function lightRagSearch(
  graph: GraphStore,
  seeds: readonly GraphSeedCandidate[],
): GraphEvidence[] {
  const evidence = new Map<string, EvidenceAccumulator>();

  for (const candidate of seeds) {
    const seed = graph.getNode(candidate.nodeId);
    if (!seed) continue;
    if (seed.kind === "entity" && isNoisyEntityLabel(seed.label, seed.entityKind)) continue;

    const confidence = clamp01(candidate.score);
    const confidenceMultiplier = 0.5 + confidence * 0.5;
    const seedEntities = seed.kind === "entity" ? [seed.label] : [];
    if (seed.chunkId) {
      addEvidence(evidence, seed.chunkId, 1 + confidence, seedEntities, []);
    }

    for (const { node, edge } of graph.neighbors(candidate.nodeId)) {
      if (node.kind === "entity" && isNoisyEntityLabel(node.label, node.entityKind)) continue;
      const chunkId = edge.chunkId ?? node.chunkId;
      if (!chunkId) continue;

      // Exact and fuzzy entity seeds carry their query relevance with them. This also
      // records fuzzy matches that would be lost by rechecking exact query tokens here.
      const matchedEntities = seedEntities;
      const queryMatchBonus = seed.kind === "entity" ? confidence * 1.5 : 0;

      addEvidence(
        evidence,
        chunkId,
        edge.weight * confidenceMultiplier + queryMatchBonus,
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
