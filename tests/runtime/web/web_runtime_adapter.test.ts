/**
 * Intent: PRD-013 observer lock — web adapter must enforce in-flight single-writer guard, map hash mismatch to web guide, and expose safe snapshot DTO only.
 * Scope: LocalWebRuntimeAdapter behavior for submit/reset/state projection with injected runtime dependencies.
 * Non-Goals: HTTP routing, SSE transport, or external provider network execution.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { LocalWebRuntimeAdapter } from "../../../src/adapters/web/web.runtime_adapter";
import { RuntimeError } from "../../../runtime/error";
import type { RuntimeRunResult } from "../../../runtime/orchestrator/run_request";

function makeRunResult(inputText: string): RuntimeRunResult {
  return {
    output: `echo:${inputText}`,
    policyId: "default",
    modeLabel: "default",
    provider: "gemini",
    model: "gemini-2.5-flash",
    domain: "global",
    secretProfileLabel: "default",
    sessionFilename: "session_state.web.default.json",
    loadedSessionId: undefined,
    currentStepLabel: "Completed",
    history: [
      { role: "user", content: inputText },
      { role: "assistant", content: `echo:${inputText}` },
    ],
  };
}

test("in-flight guard: concurrent submit on same session returns SESSION_CONFLICT", async () => {
  let release: () => void = () => {};
  const block = new Promise<void>((resolve) => {
    release = resolve;
  });

  const adapter = new LocalWebRuntimeAdapter({
    runOnce: async (input) => {
      await block;
      return makeRunResult(input.inputText);
    },
    getSessionSnapshot: () => ({ exists: false, state: null }),
  });

  await adapter.initWebSession("alpha");
  const first = adapter.submitInput({ sessionId: "alpha", text: "first" });
  await Promise.resolve();

  await assert.rejects(
    () => adapter.submitInput({ sessionId: "alpha", text: "second" }),
    (error: unknown) => {
      assert.equal(error instanceof RuntimeError, true);
      const runtimeError = error as RuntimeError;
      assert.equal(runtimeError.errorCode, "SESSION_CONFLICT");
      assert.equal(runtimeError.httpStatus, 409);
      return true;
    }
  );

  release();
  await first;
});

test("hash mismatch: returns web guide and does not auto-rotate/reset", async () => {
  let resetCalls = 0;
  const adapter = new LocalWebRuntimeAdapter({
    runOnce: async () => {
      throw new Error("SESSION_STATE_HASH_MISMATCH expected=a actual=b");
    },
    resetSession: () => {
      resetCalls += 1;
    },
    getSessionSnapshot: () => ({ exists: false, state: null }),
  });

  await adapter.initWebSession("beta");
  await assert.rejects(
    () => adapter.submitInput({ sessionId: "beta", text: "hello" }),
    (error: unknown) => {
      assert.equal(error instanceof RuntimeError, true);
      const runtimeError = error as RuntimeError;
      assert.equal(runtimeError.errorCode, "PLAN_HASH_MISMATCH");
      assert.equal(
        runtimeError.guideMessage,
        "abort_with_guide(web_session_expired_confirm)"
      );
      return true;
    }
  );

  assert.equal(resetCalls, 0);
});

test("snapshot DTO: exposes currentStepLabel string and no core graph fields", async () => {
  const adapter = new LocalWebRuntimeAdapter({
    runOnce: async (input) => makeRunResult(input.inputText),
    getSessionSnapshot: () => ({ exists: false, state: null }),
  });

  await adapter.initWebSession("gamma");
  await adapter.submitInput({ sessionId: "gamma", text: "hello" });
  const snapshot = await adapter.getCurrentState("gamma");
  const snapshotRecord = snapshot as unknown as Record<string, unknown>;

  assert.equal(typeof snapshot.currentStepLabel, "string");
  assert.equal("executionPlan" in snapshotRecord, false);
  assert.equal("policyRef" in snapshotRecord, false);
});
