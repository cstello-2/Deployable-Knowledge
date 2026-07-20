import assert from "node:assert/strict";
import test from "node:test";
import { withAssistantRequestLock } from "./assistantRequestState";

test("assistant request lock stays active until a successful request finishes", async () => {
  const state = { assistantRequestInFlight: false };
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  const request = withAssistantRequestLock(state, async () => {
    assert.equal(state.assistantRequestInFlight, true);
    await pending;
    return "complete";
  });

  assert.equal(state.assistantRequestInFlight, true);
  release();
  assert.equal(await request, "complete");
  assert.equal(state.assistantRequestInFlight, false);
});

test("assistant request lock is restored after a failed request", async () => {
  const state = { assistantRequestInFlight: false };

  await assert.rejects(
    withAssistantRequestLock(state, async () => {
      assert.equal(state.assistantRequestInFlight, true);
      throw new Error("provider failed");
    }),
    /provider failed/,
  );

  assert.equal(state.assistantRequestInFlight, false);
});

test("assistant request lock rejects overlapping requests", async () => {
  const state = { assistantRequestInFlight: true };
  let called = false;

  await assert.rejects(
    withAssistantRequestLock(state, async () => {
      called = true;
    }),
    /already in progress/,
  );

  assert.equal(called, false);
  assert.equal(state.assistantRequestInFlight, true);
});
