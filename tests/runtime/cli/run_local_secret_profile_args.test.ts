/**
 * Intent: PRD-011 run_local CLI must parse `--secret-profile` and default it to `default`.
 * Scope: `parseRunLocalArgs` flag parsing for secret profile selection.
 * Non-Goals: Provider resolution or runtime graph execution.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseRunLocalArgs } from "../../../runtime/cli/run_local.args";

test("run_local args: secret profile defaults to default", () => {
  const args = parseRunLocalArgs(["--provider", "gemini", "--", "hello"]);
  assert.equal(args.secretProfile, "default");
});

test("run_local args: --secret-profile overrides default", () => {
  const args = parseRunLocalArgs([
    "--secret-profile",
    "work",
    "--provider",
    "gemini",
    "--",
    "hello",
  ]);
  assert.equal(args.secretProfile, "work");
});
