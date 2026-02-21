/**
 * Intent: PRD-007 v1.1 step contract lock validation must enforce version, order, metadata, and failure gates.
 * Scope: Core executor validation for v1/v1.1 plans, including new v1.1 StepTypes and extensions restrictions.
 * Non-Goals: PRD-005 decision/evidence storage or retrieval algorithm implementation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { executePlan } from "../../src/core/plan/plan.executor";
import { coreStepExecutors } from "../../src/core/plan/plan.handlers";
import { createStepExecutorRegistry } from "../../src/core/plan/step.registry";
import { toCoreExecutionPlan } from "../../runtime/graph/graph";
import type {
  ExecutionPlanV1,
  GraphState,
  PlanExecutorDeps,
  StepDefinition,
} from "../../src/core/plan/plan.types";
import { CycleFailError, FailFastError } from "../../src/core/plan/errors";
import type { StepExecutor } from "../../src/core/plan/step.registry";
import type { ExecutionPlan as PolicyExecutionPlan } from "../../src/policy/schema/policy.types";
import { isExecutionPlanV1 as isCorePlanV1 } from "../../src/core/plan/plan.types";

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
  };
}

function makeState(plan: ExecutionPlanV1): GraphState {
  return {
    userInput: "hello",
    executionPlan: plan,
    policyRef: Object.freeze({ policyId: "policy-alpha" }),
    currentMode: "test",
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

function makePlan(input: {
  version: "1" | "1.1";
  steps: readonly StepDefinition[];
  extensions?: readonly unknown[];
  topK?: number;
}): ExecutionPlanV1 {
  return {
    step_contract_version: input.version,
    extensions: (input.extensions ?? []) as readonly [],
    metadata: {
      policyProfile: "default",
      mode: "default",
      topK: input.topK,
    },
    steps: input.steps,
  };
}

function createRegistry(overrides?: Readonly<Record<string, StepExecutor>>) {
  const registry = createStepExecutorRegistry();
  for (const [kind, executor] of Object.entries(coreStepExecutors)) {
    registry.register(kind, executor);
  }
  if (overrides) {
    for (const [kind, executor] of Object.entries(overrides)) {
      registry.register(kind, executor);
    }
  }
  return registry;
}

const MANDATORY_STEPS: readonly StepDefinition[] = Object.freeze([
  { id: "s1", type: "ContextSelect", payload: { input: "hello", sources: [] } },
  { id: "s2", type: "PromptAssemble", payload: {} },
  { id: "s3", type: "LLMCall", payload: {} },
  { id: "s4", type: "PersistSession", payload: { sessionRef: "s", meta: {} } },
]);

test("v1.1: version gate accepts step_contract_version=1.1", async () => {
  const plan = makePlan({
    version: "1.1",
    steps: MANDATORY_STEPS,
  });

  const result = await executePlan(plan, makeState(plan), makeDeps(), createRegistry());
  assert.equal(Array.isArray(result.stepLog), true);
  assert.equal(result.stepLog.length, 4);
});

test("v1.1: canonical subsequence accepts RetrieveDecisionContext in-order", async () => {
  const plan = makePlan({
    version: "1.1",
    steps: [
      { id: "s1", type: "ContextSelect", payload: { input: "hello", sources: [] } },
      {
        id: "s2",
        type: "RetrieveDecisionContext",
        payload: { input: "hello" },
      },
      { id: "s3", type: "PromptAssemble", payload: {} },
      { id: "s4", type: "LLMCall", payload: {} },
      { id: "s5", type: "PersistSession", payload: { sessionRef: "s", meta: {} } },
    ],
  });

  const result = await executePlan(
    plan,
    makeState(plan),
    makeDeps(),
    createRegistry({
      RetrieveDecisionContext: () => ({ kind: "ok", data: { decisions: [], anchors: [] } }),
    })
  );

  assert.deepEqual(result.stepLog, ["s1", "s2", "s3", "s4", "s5"]);
});

test("v1.1: canonical subsequence rejects out-of-order new step", async () => {
  const plan = makePlan({
    version: "1.1",
    steps: [
      { id: "s1", type: "ContextSelect", payload: { input: "hello", sources: [] } },
      { id: "s2", type: "PersistDecision", payload: { decision: {} } },
      { id: "s3", type: "PromptAssemble", payload: {} },
      { id: "s4", type: "LLMCall", payload: {} },
      { id: "s5", type: "PersistSession", payload: { sessionRef: "s", meta: {} } },
    ],
  });

  await assert.rejects(
    () => executePlan(plan, makeState(plan), makeDeps(), createRegistry()),
    (error: unknown) =>
      error instanceof CycleFailError &&
      /non-canonical order/i.test(error.message)
  );
});

test("v1.1: RetrieveMemory requires metadata.topK", async () => {
  const plan = makePlan({
    version: "1.1",
    steps: [
      { id: "s1", type: "ContextSelect", payload: { input: "hello", sources: [] } },
      { id: "s2", type: "RetrieveMemory", payload: { input: "hello", topK: 3 } },
      { id: "s3", type: "PromptAssemble", payload: {} },
      { id: "s4", type: "LLMCall", payload: {} },
      { id: "s5", type: "PersistSession", payload: { sessionRef: "s", meta: {} } },
    ],
  });

  await assert.rejects(
    () => executePlan(plan, makeState(plan), makeDeps(), createRegistry()),
    (error: unknown) =>
      error instanceof CycleFailError &&
      /RetrieveMemory requires metadata\.topK/.test(error.message)
  );
});

test("v1.1: RetrieveDecisionContext does not require metadata.topK", async () => {
  const plan = makePlan({
    version: "1.1",
    steps: [
      { id: "s1", type: "ContextSelect", payload: { input: "hello", sources: [] } },
      { id: "s2", type: "RetrieveDecisionContext", payload: { input: "hello" } },
      { id: "s3", type: "PromptAssemble", payload: {} },
      { id: "s4", type: "LLMCall", payload: {} },
      { id: "s5", type: "PersistSession", payload: { sessionRef: "s", meta: {} } },
    ],
  });

  const result = await executePlan(
    plan,
    makeState(plan),
    makeDeps(),
    createRegistry({
      RetrieveDecisionContext: () => ({ kind: "ok", data: { decisions: [], anchors: [] } }),
    })
  );

  assert.equal(result.stepLog.includes("s2"), true);
});

test("v1 and v1.1: non-empty extensions fail fast", async () => {
  const v1Plan = makePlan({
    version: "1",
    steps: MANDATORY_STEPS,
    extensions: ["x"],
  });
  const v11Plan = makePlan({
    version: "1.1",
    steps: MANDATORY_STEPS,
    extensions: ["x"],
  });

  await assert.rejects(
    () => executePlan(v1Plan, makeState(v1Plan), makeDeps(), createRegistry()),
    (error: unknown) =>
      error instanceof FailFastError &&
      /extensions must be an empty array/i.test(error.message)
  );

  await assert.rejects(
    () => executePlan(v11Plan, makeState(v11Plan), makeDeps(), createRegistry()),
    (error: unknown) =>
      error instanceof FailFastError &&
      /extensions must be an empty array/i.test(error.message)
  );
});

test("v1.1: duplicate StepType and duplicate id are CycleFail", async () => {
  const duplicateTypePlan = makePlan({
    version: "1.1",
    steps: [
      { id: "s1", type: "ContextSelect", payload: { input: "hello", sources: [] } },
      { id: "s2", type: "ContextSelect", payload: { input: "hello", sources: [] } },
      { id: "s3", type: "PromptAssemble", payload: {} },
      { id: "s4", type: "LLMCall", payload: {} },
      { id: "s5", type: "PersistSession", payload: { sessionRef: "s", meta: {} } },
    ],
  });

  const duplicateIdPlan = makePlan({
    version: "1.1",
    steps: [
      { id: "same", type: "ContextSelect", payload: { input: "hello", sources: [] } },
      { id: "same", type: "PromptAssemble", payload: {} },
      { id: "s3", type: "LLMCall", payload: {} },
      { id: "s4", type: "PersistSession", payload: { sessionRef: "s", meta: {} } },
    ],
  });

  await assert.rejects(
    () =>
      executePlan(
        duplicateTypePlan,
        makeState(duplicateTypePlan),
        makeDeps(),
        createRegistry()
      ),
    (error: unknown) =>
      error instanceof CycleFailError &&
      /duplicate StepType/i.test(error.message)
  );

  await assert.rejects(
    () => executePlan(duplicateIdPlan, makeState(duplicateIdPlan), makeDeps(), createRegistry()),
    (error: unknown) =>
      error instanceof CycleFailError &&
      /duplicate StepDefinition\.id/i.test(error.message)
  );
});

test("runtime normalization: emit step_contract_version=1 for legacy-only steps", () => {
  const policyPlan: PolicyExecutionPlan = {
    version: "1.0",
    steps: [
      { type: "recall", params: {} },
      { type: "assemble_prompt", params: {} },
      { type: "llm_call", params: {} },
      { type: "memory_write", params: {} },
    ],
    metadata: {
      policyId: "policy-alpha",
      modeLabel: "default",
    },
  };

  const corePlan = toCoreExecutionPlan(policyPlan);
  assert.equal(isCorePlanV1(corePlan), true);
  if (!isCorePlanV1(corePlan)) {
    assert.fail("expected v1 plan");
  }
  assert.equal(corePlan.step_contract_version, "1");
  assert.deepEqual(corePlan.extensions, []);
});

test("runtime normalization: emit step_contract_version=1.1 when v1.1 step exists", () => {
  const policyPlan: PolicyExecutionPlan = {
    version: "1.0",
    steps: [
      { type: "recall", params: {} },
      { type: "RetrieveDecisionContext", params: { input: "hello" } },
      { type: "assemble_prompt", params: {} },
      { type: "llm_call", params: {} },
      { type: "memory_write", params: {} },
    ],
    metadata: {
      policyId: "policy-alpha",
      modeLabel: "default",
    },
  };

  const corePlan = toCoreExecutionPlan(policyPlan);
  assert.equal(isCorePlanV1(corePlan), true);
  if (!isCorePlanV1(corePlan)) {
    assert.fail("expected v1 plan");
  }
  assert.equal(corePlan.step_contract_version, "1.1");
  assert.deepEqual(corePlan.extensions, []);
});
