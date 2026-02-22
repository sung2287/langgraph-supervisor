/**
 * Intent: PRD-013 namespace split lock — web sessions must be prefixed with `web.` and use isolated filenames from CLI default.
 * Scope: Runtime web session naming helpers for prefix enforcement and filename construction.
 * Non-Goals: Runtime execution pipeline, graph behavior, or storage rotation internals.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSessionFilename,
  buildWebSessionFilename,
  buildWebSessionId,
} from "../../../runtime/orchestrator/session_namespace";

test("web namespace: sessionId is always prefixed with web.", () => {
  assert.equal(buildWebSessionId("alpha"), "web.alpha");
  assert.equal(buildWebSessionId("web.alpha"), "web.alpha");
});

test("web namespace: filename never equals CLI default session_state.json", () => {
  const cliFilename = buildSessionFilename(undefined);
  const webFilename = buildWebSessionFilename("alpha");
  assert.equal(cliFilename, "session_state.json");
  assert.equal(webFilename, "session_state.web.alpha.json");
  assert.notEqual(webFilename, cliFilename);
});
