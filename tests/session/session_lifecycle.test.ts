/** Intent: PRD-004 lifecycle ordering - verify only when loaded exists, and save exactly once only on success. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  runSessionLifecycle,
  shouldVerifyOnBoot,
} from "../../src/session/session.lifecycle";
import type { SessionState, SessionStore } from "../../src/session/session.types";

function state(hash: string): SessionState {
  return {
    sessionId: "session-1",
    memoryRef: "memory-1",
    repoScanVersion: "scan-v1",
    lastExecutionPlanHash: hash,
    updatedAt: "2026-02-20T00:00:00.000Z",
  };
}

test("shouldVerifyOnBoot: null => false, loaded => true", () => {
  assert.equal(shouldVerifyOnBoot(null), false);
  assert.equal(shouldVerifyOnBoot(state("hash-a")), true);
});

test("lifecycle: loaded=null skips verify and saves once on success", async () => {
  const calls: string[] = [];
  const store: SessionStore = {
    load() {
      calls.push("load");
      return null;
    },
    verify() {
      calls.push("verify");
    },
    save(next) {
      calls.push(`save:${next.lastExecutionPlanHash}`);
    },
  };

  const outcome = await runSessionLifecycle({
    store,
    expectedHash: "hash-a",
    run: async (loaded) => {
      calls.push(`run:${loaded === null ? "cold" : "resume"}`);
      return {
        success: true,
        result: "ok",
        nextSession: state("hash-a"),
      };
    },
  });

  assert.equal(outcome.result, "ok");
  assert.deepEqual(calls, ["load", "run:cold", "save:hash-a"]);
});

test("lifecycle: loaded exists verifies once before run", async () => {
  const calls: string[] = [];
  const store: SessionStore = {
    load() {
      calls.push("load");
      return state("hash-a");
    },
    verify(expectedHash) {
      calls.push(`verify:${expectedHash}`);
    },
    save() {
      calls.push("save");
    },
  };

  await runSessionLifecycle({
    store,
    expectedHash: "hash-a",
    run: async () => {
      calls.push("run");
      return {
        success: true,
        result: "ok",
        nextSession: state("hash-a"),
      };
    },
  });

  assert.deepEqual(calls, ["load", "verify:hash-a", "run", "save"]);
});

test("lifecycle: save is not called when run reports failure", async () => {
  const calls: string[] = [];
  const store: SessionStore = {
    load() {
      calls.push("load");
      return null;
    },
    verify() {
      calls.push("verify");
    },
    save() {
      calls.push("save");
    },
  };

  const outcome = await runSessionLifecycle({
    store,
    expectedHash: "hash-a",
    run: async () => {
      calls.push("run");
      return {
        success: false,
        result: "failed",
      };
    },
  });

  assert.equal(outcome.result, "failed");
  assert.deepEqual(calls, ["load", "run"]);
});
