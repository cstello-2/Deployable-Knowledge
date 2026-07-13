import assert from "node:assert/strict";
import test from "node:test";
import { GraphStore } from "./graph-store";
import { lightRagSearch } from "./light-rag";
import { pathRagSearch } from "./path-rag";
import {
  mergeGraphSeedCandidates,
  selectExactEntitySeedCandidates,
  selectFuzzyEntitySeedCandidates,
  selectGraphSeedCandidates,
  selectHybridSeedCandidates,
  type GraphSeedCandidate,
} from "./seed-selection";
import { graphId } from "./utils";

test("hybrid seeds blend normalized score and rank and tolerate negative logits", () => {
  const graph = new GraphStore();
  for (const id of ["first", "second", "third"]) addChunk(graph, id);

  const seeds = selectHybridSeedCandidates(graph, [
    { chunkId: "first", score: -5 },
    { chunkId: "second", score: -2 },
    { chunkId: "third", score: -10 },
  ]);

  assert.deepEqual(seeds.map((seed) => seed.chunkId), ["second", "first", "third"]);
  assert.equal(seeds[0].score, 0.85);
  assert.ok(Math.abs(seeds[1].score - 0.7375) < 1e-12);
  assert.equal(seeds[2].score, 0);
});

test("hybrid seeds fall back to rank when reranker scores tie and deduplicate chunks", () => {
  const graph = new GraphStore();
  for (const id of ["first", "second", "third"]) addChunk(graph, id);

  const seeds = selectHybridSeedCandidates(graph, [
    { chunkId: "first", score: 2 },
    { chunkId: "second", score: 2 },
    { chunkId: "first", score: 2 },
    { chunkId: "third", score: 2 },
  ]);

  assert.deepEqual(seeds.map((seed) => seed.chunkId), ["first", "second", "third"]);
  assert.deepEqual(seeds.map((seed) => seed.score), [1, 0.5, 0]);
});

test("exact entity seeds require the complete label phrase instead of one shared token", () => {
  const graph = new GraphStore();
  addEntity(graph, "Air Combat Command");
  addEntity(graph, "Combat Support Agency");

  const contained = selectExactEntitySeedCandidates(
    "What does AIR combat command do?",
    graph,
  );
  assert.deepEqual(contained.map((seed) => seed.label), ["Air Combat Command"]);
  assert.equal(contained[0].score, 0.95);

  const equal = selectExactEntitySeedCandidates("air combat command", graph);
  assert.equal(equal[0].score, 1);
});

test("fuzzy entity seeds recover a typo but reject exact, weak, and short-label matches", () => {
  const graph = new GraphStore();
  addEntity(graph, "massive hemorrhage");
  addEntity(graph, "ventilator");
  addEntity(graph, "TCCC");

  const typo = selectFuzzyEntitySeedCandidates(
    "How is massive hemorhage treated?",
    graph,
  );
  assert.deepEqual(typo.map((seed) => seed.label), ["massive hemorrhage"]);
  assert.ok(typo[0].score >= 0.63 && typo[0].score <= 0.75);
  assert.equal(typo[0].matchedText, "massive hemorhage");

  assert.equal(
    selectFuzzyEntitySeedCandidates("massive hemorrhage", graph).length,
    0,
  );
  assert.equal(selectFuzzyEntitySeedCandidates("unrelated question", graph).length, 0);
  assert.equal(selectFuzzyEntitySeedCandidates("TCCX", graph).length, 0);
});

test("merged seeds deduplicate canonical node IDs, retain sources, cap, and sort", () => {
  const exact = candidate("entity:radar", "entity-exact", 0.95);
  const fuzzy = candidate("entity:radar", "entity-fuzzy", 0.7);
  const hybrid = candidate("chunk:one", "hybrid", 1, "one");
  const tail = candidate("chunk:two", "hybrid", 0.1, "two");

  const merged = mergeGraphSeedCandidates([[fuzzy, tail], [exact, hybrid]], 2);

  assert.deepEqual(merged.map((seed) => seed.nodeId), ["chunk:one", "entity:radar"]);
  assert.deepEqual(merged[1].sources, ["entity-exact", "entity-fuzzy"]);
  assert.equal(merged[1].sourceScores["entity-exact"], 0.95);
  assert.equal(merged[1].sourceScores["entity-fuzzy"], 0.7);
});

test("fuzzy entity seeds surface graph evidence outside the hybrid chunk set", () => {
  const graph = new GraphStore();
  const hybridChunk = addChunk(graph, "hybrid-chunk");
  const graphChunk = addChunk(graph, "graph-chunk");
  const hemorrhage = addEntity(graph, "massive hemorrhage");

  graph.addEdge({
    source: graphChunk,
    target: hemorrhage,
    relation: "MENTIONS",
    weight: 1,
    evidence: "Control massive hemorrhage",
    chunkId: "graph-chunk",
  });

  const seeds = selectGraphSeedCandidates({
    query: "How is massive hemorhage controlled?",
    graph,
    hybridResults: [{ chunkId: "hybrid-chunk", score: 1 }],
  });
  assert.ok(seeds.some((seed) => seed.sources.includes("entity-fuzzy")));

  const evidence = lightRagSearch(graph, seeds);
  assert.ok(evidence.some((match) => match.chunkId === "graph-chunk"));

  const paths = pathRagSearch(
    "How is massive hemorhage controlled?",
    graph,
    seeds,
    2,
    10,
  );
  assert.ok(paths.some((path) => path.chunkIds.includes("graph-chunk")));
  assert.ok(graph.getNode(hybridChunk));
});

function addChunk(graph: GraphStore, chunkId: string): string {
  const id = graphId("chunk", chunkId);
  graph.addNode({ id, label: `Chunk ${chunkId}`, kind: "chunk", chunkId });
  return id;
}

function addEntity(graph: GraphStore, label: string): string {
  const id = graphId("entity", label);
  graph.addNode({ id, label, kind: "entity", entityKind: "concept" });
  return id;
}

function candidate(
  nodeId: string,
  source: GraphSeedCandidate["sources"][number],
  score: number,
  chunkId?: string,
): GraphSeedCandidate {
  return {
    nodeId,
    kind: chunkId ? "chunk" : "entity",
    label: nodeId,
    chunkId,
    score,
    sources: [source],
    sourceScores: { [source]: score },
  };
}
