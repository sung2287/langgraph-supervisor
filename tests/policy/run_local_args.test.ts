/**
 * Intent: PRD-008 lock — CLI phase parsing is syntax-only and final phase validity is owned by PolicyInterpreter.
 * Scope: run_local args normalization behavior for default/chat alias and pass-through unknown phases.
 * Non-Goals: Policy profile mode existence validation in CLI.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhase,
  parseRunLocalArgs,
} from "../../runtime/cli/run_local.args";

test("run_local args: defaults profile to default when flag is absent", () => {
  const args = parseRunLocalArgs(["--repo", ".", "--", "ping"]);
  assert.equal(args.profile, "default");
  assert.equal(args.repoPath, ".");
  assert.equal(args.input, "ping");
});

test("phase: --phase default => default", () => {
  const args = parseRunLocalArgs(["--phase", "default"]);
  assert.equal(args.phase, "default");
});

test("phase: --phase diagnose => diagnose", () => {
  const args = parseRunLocalArgs(["--phase", "diagnose"]);
  assert.equal(args.phase, "diagnose");
});

test("phase: --phase implement => implement", () => {
  const args = parseRunLocalArgs(["--phase", "implement"]);
  assert.equal(args.phase, "implement");
});

test("phase: legacy CHAT maps to default", () => {
  const args = parseRunLocalArgs(["--phase", "CHAT"]);
  assert.equal(args.phase, "default");
  assert.equal(normalizePhase("CHAT"), "default");
});

test("phase: omitted flag defaults to default", () => {
  const args = parseRunLocalArgs([]);
  assert.equal(args.phase, "default");
});

test("phase: unknown value is passed through for interpreter validation", () => {
  const args = parseRunLocalArgs(["--phase", "WHAT"]);
  assert.equal(args.phase, "what");
});

test("phase parsing works with -- separator", () => {
  const args = parseRunLocalArgs(["--", "--phase", "default", "--", "hello"]);
  assert.equal(args.phase, "default");
  assert.equal(args.input, "hello");
});
