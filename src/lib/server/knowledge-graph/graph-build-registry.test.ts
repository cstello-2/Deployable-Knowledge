import assert from "node:assert/strict";
import test from "node:test";
import {
  KnowledgeGraphBuildRegistry,
  type KnowledgeGraphBuildScope,
  type KnowledgeGraphBuildStats,
} from "./graph-build-registry";

const stats: KnowledgeGraphBuildStats = {
  documents: 1,
  chunks: 2,
  nodes: 3,
  edges: 4,
};

function scope(signature = "signature-1"): KnowledgeGraphBuildScope {
  return {
    scopeKey: "documents:test",
    documentIds: ["document-1"],
    documentCount: 1,
    signature,
    buildVersion: "1",
  };
}

test("concurrent Knowledge Graph builds share one in-flight build", async () => {
  const registry = new KnowledgeGraphBuildRegistry<{ id: string }>();
  let buildCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const builder = async () => {
    buildCalls += 1;
    await gate;
    return { index: { id: "graph-1" }, stats };
  };

  const first = registry.build(scope(), builder);
  const second = registry.build(scope(), builder);
  assert.equal(registry.getStatus(scope()).status, "building");

  release();
  const [firstStatus, secondStatus] = await Promise.all([first, second]);

  assert.equal(buildCalls, 1);
  assert.equal(firstStatus.status, "built");
  assert.equal(secondStatus.status, "built");
  assert.deepEqual(registry.getBuilt(scope()), { id: "graph-1" });
});

test("a signature change marks a built graph as needing rebuild", async () => {
  const registry = new KnowledgeGraphBuildRegistry<{ id: string }>();
  await registry.build(scope(), async () => ({ index: { id: "graph-1" }, stats }));

  const changed = registry.getStatus(scope("signature-2"));
  assert.equal(changed.status, "not_built");
  assert.equal(changed.needsRebuild, true);
  assert.equal(changed.builtSignature, "signature-1");
  assert.equal(registry.getBuilt(scope("signature-2")), undefined);
});

test("a failed build records its error and can be retried", async () => {
  const registry = new KnowledgeGraphBuildRegistry<{ id: string }>();
  const failed = await registry.build(scope(), async () => {
    throw new Error("extractor failed");
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "extractor failed");

  const retried = await registry.build(scope(), async () => ({
    index: { id: "graph-after-retry" },
    stats,
  }));
  assert.equal(retried.status, "built");
  assert.deepEqual(registry.getBuilt(scope()), { id: "graph-after-retry" });
});

test("a persisted graph can be restored as a built registry entry", () => {
  const registry = new KnowledgeGraphBuildRegistry<{ id: string }>();
  registry.restore(
    scope(),
    { index: { id: "restored-graph" }, stats },
    "2026-07-13T12:00:00.000Z",
  );

  assert.equal(registry.getStatus(scope()).status, "built");
  assert.deepEqual(registry.getBuilt(scope()), { id: "restored-graph" });
});

test("stale persisted metadata requires a rebuild without publishing an index", () => {
  const registry = new KnowledgeGraphBuildRegistry<{ id: string }>();
  registry.rememberStaleSnapshot(
    scope("signature-2"),
    "signature-1",
    stats,
    "2026-07-13T12:00:00.000Z",
  );

  const status = registry.getStatus(scope("signature-2"));
  assert.equal(status.status, "not_built");
  assert.equal(status.needsRebuild, true);
  assert.equal(status.builtSignature, "signature-1");
  assert.equal(registry.getBuilt(scope("signature-2")), undefined);
});
