// This focused test proves that one-hop evidence and a three-edge relational path can
// connect two stored chunks without loading PDFs, embeddings, or the application database.

import assert from "node:assert/strict";
import test from "node:test";
import { GraphStore } from "./graph-store";
import { lightRagSearch } from "./light-rag";
import { pathRagSearch } from "./path-rag";
import { selectGraphSeedCandidates } from "./seed-selection";
import { graphId } from "./utils";

test("LightRAG and PathRAG retrieve connected chunk evidence", () => {
  const graph = new GraphStore();
  const firstChunk = graphId("chunk", "chunk-1");
  const secondChunk = graphId("chunk", "chunk-2");
  const march = graphId("entity", "MARCH");
  const hemorrhage = graphId("entity", "massive hemorrhage");

  graph.addNode({ id: firstChunk, label: "TCCC page 1", kind: "chunk", chunkId: "chunk-1" });
  graph.addNode({ id: secondChunk, label: "TCCC page 2", kind: "chunk", chunkId: "chunk-2" });
  graph.addNode({ id: march, label: "MARCH", kind: "entity", entityKind: "protocol" });
  graph.addNode({ id: hemorrhage, label: "massive hemorrhage", kind: "entity", entityKind: "condition" });
  graph.addEdge({ source: firstChunk, target: march, relation: "MENTIONS", weight: 1, evidence: "MARCH", chunkId: "chunk-1" });
  graph.addEdge({ source: march, target: hemorrhage, relation: "HAS_STEP", weight: 3, evidence: "MARCH begins with massive hemorrhage", chunkId: "chunk-1" });
  graph.addEdge({ source: hemorrhage, target: secondChunk, relation: "MENTIONS", weight: 1, evidence: "Control massive hemorrhage", chunkId: "chunk-2" });

  const lightSeeds = selectGraphSeedCandidates({
    query: "What is MARCH?",
    graph,
    hybridResults: [{ chunkId: "chunk-1", score: 1 }],
  });
  const light = lightRagSearch(graph, lightSeeds);
  assert.ok(light.some((result) => result.chunkId === "chunk-1"));

  const pathSeeds = selectGraphSeedCandidates({
    query: "How is MARCH related to hemorrhage?",
    graph,
    hybridResults: [{ chunkId: "chunk-1", score: 1 }],
  });
  const paths = pathRagSearch(
    "How is MARCH related to hemorrhage?",
    graph,
    pathSeeds,
    3,
    10,
  );
  assert.ok(paths.some((path) => path.chunkIds.includes("chunk-2")));
});
