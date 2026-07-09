// Typed rules capture high-confidence domain facts; same-sentence co-occurrence supplies
// broader graph connectivity when a sentence does not match a specialized rule.

import type { ExtractedEntity } from "./entity-extractor";
import type { GraphEdge, RelationType } from "./types";
import { graphId, splitSentences } from "./utils";

type RelationRule = {
  relation: RelationType;
  pattern: RegExp;
  source: string;
  target: string;
};

const RULES: RelationRule[] = [
  { relation: "USES", pattern: /radar.*uses?.*radio waves/i, source: "Radar", target: "radio waves" },
  { relation: "HAS_COMPONENT", pattern: /radar systems?.*transmitter/i, source: "Radar", target: "transmitter" },
  { relation: "HAS_COMPONENT", pattern: /radar systems?.*antenna/i, source: "Radar", target: "antenna" },
  { relation: "HAS_COMPONENT", pattern: /radar systems?.*receiver/i, source: "Radar", target: "receiver" },
  { relation: "HAS_COMPONENT", pattern: /radar systems?.*signal processor/i, source: "Radar", target: "signal processor" },
  { relation: "USES", pattern: /TCCC.*uses?.*MARCH/i, source: "TCCC", target: "MARCH" },
  { relation: "HAS_STEP", pattern: /MARCH stands for.*massive hemorrhage/i, source: "MARCH", target: "massive hemorrhage" },
  { relation: "HAS_STEP", pattern: /MARCH stands for.*airway/i, source: "MARCH", target: "airway" },
  { relation: "HAS_STEP", pattern: /MARCH stands for.*respiration/i, source: "MARCH", target: "respiration" },
  { relation: "HAS_STEP", pattern: /MARCH stands for.*circulation/i, source: "MARCH", target: "circulation" },
  { relation: "HAS_STEP", pattern: /MARCH stands for.*hypothermia/i, source: "MARCH", target: "hypothermia" },
  { relation: "TREATS", pattern: /tourniquets?.*control.*hemorrhage/i, source: "tourniquet", target: "massive hemorrhage" },
  { relation: "TREATS", pattern: /needle decompression.*treat.*tension pneumothorax/i, source: "needle decompression", target: "tension pneumothorax" },
];

export function extractRelations(
  chunkId: string,
  documentId: string,
  text: string,
  entities: ExtractedEntity[],
): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (const sentence of splitSentences(text)) {
    for (const rule of RULES) {
      if (!rule.pattern.test(sentence)) continue;
      edges.push({
        source: graphId("entity", rule.source),
        target: graphId("entity", rule.target),
        relation: rule.relation,
        weight: 3,
        evidence: sentence,
        chunkId,
        documentId,
      });
    }

    const sentenceLower = sentence.toLowerCase();
    const sentenceEntities = entities.filter((entity) =>
      sentenceLower.includes(entity.label.toLowerCase()),
    );

    // Limit the pair count so noisy title-heavy sentences cannot create a graph explosion.
    for (let left = 0; left < Math.min(sentenceEntities.length, 10); left += 1) {
      for (let right = left + 1; right < Math.min(sentenceEntities.length, 10); right += 1) {
        edges.push({
          source: graphId("entity", sentenceEntities[left].label),
          target: graphId("entity", sentenceEntities[right].label),
          relation: "CO_OCCURS_WITH",
          weight: 0.4,
          evidence: sentence,
          chunkId,
          documentId,
        });
      }
    }
  }

  return edges;
}
