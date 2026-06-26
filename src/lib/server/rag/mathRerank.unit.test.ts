import assert from "node:assert/strict";
import test from "node:test";

import {
  reRankData,
  weightedReciprocalRankRerank,
  type Document,
} from "./mathRerank";

test("weighted reciprocal rank reranker applies the configured equation", () => {
  const bm25Rank: Document[] = [
    { segmentID: "shared", text: "shared result", source: "manual.md", page: 1 },
    { segmentID: "bm25-only", text: "bm25 result", source: "manual.md", page: 2 },
  ];
  const vectorRank: Document[] = [
    { segmentID: "vector-only", text: "vector result", source: "manual.md", page: 3 },
    { segmentID: "shared", text: "shared vector result", source: "manual.md", page: 1 },
  ];

  const results = weightedReciprocalRankRerank(bm25Rank, vectorRank, {
    bm25Weight: 0.4,
    vectorWeight: 0.6,
    rankConstant: 60,
    missingRank: 100,
  });

  const shared = results.find((doc) => doc.segmentID === "shared");
  assert.ok(shared);

  const expectedScore = 0.4 / (60 + 1) + 0.6 / (60 + 2);
  assert.equal(shared.bm25Rank, 1);
  assert.equal(shared.vectorRank, 2);
  assert.equal(shared.score, expectedScore);
});

test("reranker sorts by fused score and supports limiting result count", () => {
  const bm25Rank: Document[] = [
    { segmentID: "shared", text: "shared result", source: "manual.md", page: 1 },
    { segmentID: "bm25-only", text: "bm25 result", source: "manual.md", page: 2 },
  ];
  const vectorRank: Document[] = [
    { segmentID: "shared", text: "shared vector result", source: "manual.md", page: 1 },
    { segmentID: "vector-only", text: "vector result", source: "manual.md", page: 3 },
  ];

  const results = weightedReciprocalRankRerank(bm25Rank, vectorRank, {
    bm25Weight: 0.4,
    vectorWeight: 0.6,
    limit: 2,
  });

  assert.equal(results.length, 2);
  assert.equal(results[0]?.segmentID, "shared");
  assert.ok((results[0]?.score ?? 0) >= (results[1]?.score ?? 0));
});

test("reranker keeps source documents immutable", () => {
  const bm25Rank: Document[] = [
    { segmentID: "bm25-a", text: "airway", source: "manual-a.md", page: 1, score: 42 },
  ];
  const vectorRank: Document[] = [
    { segmentID: "bm25-a", text: "airway vector", source: "manual-a.md", page: 1, score: 0.8 },
  ];

  reRankData(bm25Rank, vectorRank);

  assert.equal(bm25Rank[0]?.score, 42);
  assert.equal(vectorRank[0]?.score, 0.8);
});

test("legacy reRankData wrapper uses the same reranker", () => {
  const bm25Rank: Document[] = [
    { segmentID: "a", text: "a", source: "manual.md", page: 1 },
  ];
  const vectorRank: Document[] = [
    { segmentID: "a", text: "a", source: "manual.md", page: 1 },
  ];

  assert.deepEqual(
    reRankData(bm25Rank, vectorRank),
    weightedReciprocalRankRerank(bm25Rank, vectorRank),
  );
});
