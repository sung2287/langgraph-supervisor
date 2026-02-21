/**
 * Intent: PRD-008 PolicyInterpreter contract lock — interpreter must emit normalized execution plans and own phase validation.
 * Scope: Profile loading fail-fast, normalized step/type output stability, and invalid phase ConfigurationError before graph/core.
 * Non-Goals: Core executor contract validation semantics and runtime graph legacy mapping behavior.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PolicyInterpreter } from "../../src/policy/interpreter/policy.interpreter";
import { ConfigurationError } from "../../src/policy/interpreter/policy.errors";
import { toCoreExecutionPlan } from "../../runtime/graph/graph";
import { executePlan } from "../../src/core/plan/plan.executor";
import { coreStepExecutors } from "../../src/core/plan/plan.handlers";
import { createStepExecutorRegistry } from "../../src/core/plan/step.registry";
import type {
  ExecutionPlanV1,
  GraphState,
  PlanExecutorDeps,
} from "../../src/core/plan/plan.types";

class NoopMemoryRepo {
  async write(): Promise<void> {
    return;
  }
}

function makeDeps(): PlanExecutorDeps {
  return {
    llmClient: {
      async generate(prompt: string): Promise<string> {
        return `LLM:${prompt}`;
      },
    },
    memoryRepo: new NoopMemoryRepo(),
    persistSession: async () => ({ persisted: true }),
  };
}

function makeState(plan: ExecutionPlanV1): GraphState {
  return {
    userInput: "hello",
    executionPlan: plan,
    policyRef: Object.freeze({ policyId: "policy-default" }),
    projectId: "test-project",
    currentMode: "default",
    currentDomain: undefined,
    loadedDocs: undefined,
    selectedContext: undefined,
    assembledPrompt: undefined,
    actOutput: undefined,
    stepResults: undefined,
    stepUnavailableReasons: undefined,
    repoScanVersion: undefined,
    repoContextArtifactPath: undefined,
    repoContextUnavailableReason: undefined,
    lastResponse: undefined,
    stepLog: [],
  };
}

function makeRegistry() {
  const registry = createStepExecutorRegistry();
  for (const [kind, executor] of Object.entries(coreStepExecutors)) {
    registry.register(kind, executor);
  }
  return registry;
}

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

function stepTypes(plan: ReturnType<PolicyInterpreter["resolveExecutionPlan"]>): string[] {
  return plan.steps.map((step) => step.type);
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

test("policy interpreter: representative mode normalization stays stable (snapshot-ish)", () => {
  const interpreter = new PolicyInterpreter({
    repoRoot: process.cwd(),
    profile: "default",
  });

  const plan = interpreter.resolveExecutionPlan({ userInput: "hello world" });

  assert.deepEqual(plan, {
    step_contract_version: "1",
    extensions: [],
    metadata: {
      policyProfile: "default",
      mode: "default",
      topK: undefined,
    },
    steps: [
      { id: "step-1", type: "ContextSelect", payload: {} },
      { id: "step-2", type: "PromptAssemble", payload: {} },
      { id: "step-3", type: "LLMCall", payload: {} },
      { id: "step-4", type: "PersistMemory", payload: {} },
      { id: "step-5", type: "PersistSession", payload: {} },
    ],
  });
});

test("policy interpreter: extensions are enumerable and survive JSON round-trip for executor gate", async () => {
  const interpreter = new PolicyInterpreter({
    repoRoot: process.cwd(),
    profile: "default",
  });

  const plan = interpreter.resolveExecutionPlan({ userInput: "hello world" });
  const serialized = JSON.stringify(plan);
  assert.equal(serialized.includes("\"extensions\":[]"), true);

  const parsed = JSON.parse(serialized) as ReturnType<PolicyInterpreter["resolveExecutionPlan"]>;
  assert.equal(Array.isArray(parsed.extensions), true);
  assert.equal(parsed.extensions.length, 0);

  const corePlan = toCoreExecutionPlan(parsed);
  await assert.doesNotReject(() =>
    executePlan(corePlan as ExecutionPlanV1, makeState(corePlan as ExecutionPlanV1), makeDeps(), makeRegistry())
  );
});

test("policy interpreter: re: condition selects mode and emits normalized step types", () => {
  const interpreter = new PolicyInterpreter({
    repoRoot: process.cwd(),
    profile: "default",
  });

  const plan = interpreter.resolveExecutionPlan({ userInput: "diag: investigate timeout" });

  assert.equal(plan.metadata.mode, "diagnose");
  assert.deepEqual(stepTypes(plan), [
    "ContextSelect",
    "RepoScan",
    "PromptAssemble",
    "LLMCall",
    "PersistMemory",
    "PersistSession",
  ]);
});

test("policy interpreter: no trigger match falls back to default mode", () => {
  const interpreter = new PolicyInterpreter({
    repoRoot: process.cwd(),
    profile: "default",
  });

  const plan = interpreter.resolveExecutionPlan({ userInput: "hello world" });
  assert.equal(plan.metadata.mode, "default");
  assert.deepEqual(stepTypes(plan), [
    "ContextSelect",
    "PromptAssemble",
    "LLMCall",
    "PersistMemory",
    "PersistSession",
  ]);
});

test("policy interpreter: invalid requested phase throws ConfigurationError before graph/core", () => {
  const interpreter = new PolicyInterpreter({
    repoRoot: process.cwd(),
    profile: "default",
  });

  assert.throws(
    () => {
      interpreter.resolveExecutionPlan({
        userInput: "hello",
        requestedPhase: "not-a-real-mode",
      });
    },
    (error: unknown) => {
      return (
        error instanceof ConfigurationError &&
        /Unknown phase "not-a-real-mode"/.test(error.message)
      );
    }
  );
});

test("policy interpreter: invalid phase blocks graph/core handoff", () => {
  const interpreter = new PolicyInterpreter({
    repoRoot: process.cwd(),
    profile: "default",
  });

  let coreHandoffReached = false;
  assert.throws(
    () => {
      const plan = interpreter.resolveExecutionPlan({
        userInput: "hello",
        requestedPhase: "nope",
      });
      coreHandoffReached = true;
      toCoreExecutionPlan(plan);
    },
    (error: unknown) => error instanceof ConfigurationError
  );
  assert.equal(coreHandoffReached, false);
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
      - kind: "recall"
        type: "llm_call"
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

  assert.equal(plan.steps[0]?.type, "ContextSelect");
});
