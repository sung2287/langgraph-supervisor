/** Intent: PRD-002/003 policy interpreter contract — fail-fast loading and kind/type step normalization with kind priority. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PolicyInterpreter } from "../../src/policy/interpreter/policy.interpreter";
import type { ExecutionStep } from "../../src/policy/schema/policy.types";

function makeTempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "policy-interpreter-"));
}

function writeProfile(
  repoRoot: string,
  profile: string,
  files: { modes: string; triggers: string; bundles: string }
): void {
  const profileRoot = path.join(repoRoot, "policy", "profiles", profile);
  fs.mkdirSync(profileRoot, { recursive: true });
  fs.writeFileSync(path.join(profileRoot, "modes.yaml"), files.modes, "utf8");
  fs.writeFileSync(path.join(profileRoot, "triggers.yaml"), files.triggers, "utf8");
  fs.writeFileSync(path.join(profileRoot, "bundles.yaml"), files.bundles, "utf8");
}

function stepKey(step: ExecutionStep): string {
  const row = step as Record<string, unknown>;
  if (typeof row.kind === "string") {
    return row.kind;
  }
  return String(row.type);
}

test("policy interpreter: missing profile directory throws fail-fast", () => {
  const repoRoot = makeTempRepo();
  assert.throws(
    () => {
      new PolicyInterpreter({ repoRoot, profile: "missing-profile" });
    },
    /profile directory does not exist/i
  );
});

test("policy interpreter: invalid schema version throws fail-fast", () => {
  const repoRoot = makeTempRepo();
  writeProfile(repoRoot, "invalid-version", {
    modes: `version: "9.9"
modes:
  - id: "default"
    plan:
      - type: "recall"
        params: {}
`,
    triggers: `version: "1.0"
triggers: []
`,
    bundles: `version: "1.0"
bundles: []
`,
  });

  assert.throws(
    () => {
      new PolicyInterpreter({ repoRoot, profile: "invalid-version" });
    },
    /unsupported version/i
  );
});

test("policy interpreter: invalid YAML throws fail-fast", () => {
  const repoRoot = makeTempRepo();
  writeProfile(repoRoot, "invalid-yaml", {
    modes: `version "1.0"
modes:
  - id: "default"
    plan:
      - type: "recall"
        params: {}
`,
    triggers: `version: "1.0"
triggers: []
`,
    bundles: `version: "1.0"
bundles: []
`,
  });

  assert.throws(
    () => {
      new PolicyInterpreter({ repoRoot, profile: "invalid-yaml" });
    },
    /POLICY_LOAD_ERROR/i
  );
});

test("policy interpreter: re: condition selects mode and execution steps", () => {
  const interpreter = new PolicyInterpreter({
    repoRoot: process.cwd(),
    profile: "default",
  });

  const plan = interpreter.resolveExecutionPlan({ userInput: "diag: investigate timeout" });

  assert.equal(plan.metadata.modeLabel, "diagnose");
  assert.deepEqual(
    plan.steps.map((step) => stepKey(step)),
    ["recall", "repo_scan", "assemble_prompt", "llm_call", "memory_write"]
  );
});

test("policy interpreter: no trigger match falls back to default mode", () => {
  const interpreter = new PolicyInterpreter({
    repoRoot: process.cwd(),
    profile: "default",
  });

  const plan = interpreter.resolveExecutionPlan({ userInput: "hello world" });
  assert.equal(plan.metadata.modeLabel, "default");
  assert.deepEqual(
    plan.steps.map((step) => stepKey(step)),
    ["recall", "assemble_prompt", "llm_call", "memory_write"]
  );
});

test("policy interpreter: missing default mode fails fast when no trigger matches", () => {
  const repoRoot = makeTempRepo();
  writeProfile(repoRoot, "missing-default", {
    modes: `version: "1.0"
modes:
  - id: "diagnose"
    plan:
      - type: "recall"
        params: {}
`,
    triggers: `version: "1.0"
triggers: []
`,
    bundles: `version: "1.0"
bundles:
  - mode_id: "diagnose"
    files: []
`,
  });

  const interpreter = new PolicyInterpreter({
    repoRoot,
    profile: "missing-default",
  });

  assert.throws(
    () => {
      interpreter.resolveExecutionPlan({ userInput: "anything" });
    },
    /target mode 'default' is not defined/i
  );
});

test("policy interpreter: bundles can be loaded", () => {
  const interpreter = new PolicyInterpreter({
    repoRoot: process.cwd(),
    profile: "default",
  });
  const bundles = interpreter.getBundlesForMode("diagnose");
  assert.equal(Array.isArray(bundles), true);
  assert.equal(bundles.length > 0, true);
  assert.equal(Array.isArray(bundles[0]?.files), true);
});

test("policy interpreter: kind takes precedence over type when both exist", () => {
  const repoRoot = makeTempRepo();
  writeProfile(repoRoot, "kind-priority", {
    modes: `version: "1.0"
modes:
  - id: "default"
    plan:
      - kind: "opaque_kind"
        type: "legacy_type"
        params:
          x: 1
`,
    triggers: `version: "1.0"
triggers: []
`,
    bundles: `version: "1.0"
bundles: []
`,
  });

  const interpreter = new PolicyInterpreter({
    repoRoot,
    profile: "kind-priority",
  });
  const plan = interpreter.resolveExecutionPlan({ userInput: "hello" });

  assert.equal(stepKey(plan.steps[0]!), "opaque_kind");
});
