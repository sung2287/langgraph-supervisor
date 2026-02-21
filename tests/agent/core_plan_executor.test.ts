/**
 * Intent: PRD-001/003 core runtime lock — registry-dispatched execution, neutrality to currentMode, and immutable policyRef handling.
 * Scope: Core legacy execution path behavior including deterministic step dispatch and explicit domain-state mutation via dedicated step.
 * Non-Goals: Step-contract v1.1 ordering validation or storage-layer semantics.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { executePlan } from "../../src/core/plan/plan.executor";
import { coreStepExecutors } from "../../src/core/plan/plan.handlers";
import { createStepExecutorRegistry } from "../../src/core/plan/step.registry";
import type {
  ExecutionPlan,
  GraphState,
  MemoryWriteRecord,
  PlanExecutorDeps,
  PolicyRef,
} from "../../src/core/plan/plan.types";
import type { StepExecutor } from "../../src/core/plan/step.registry";

class SpyMemoryRepo {
  readonly writes: MemoryWriteRecord[] = [];

  async write(record: MemoryWriteRecord): Promise<void> {
    this.writes.push(record);
  }
}

function makePlan(stepKinds: readonly string[]): ExecutionPlan {
  return {
    version: "1.0",
    steps: stepKinds.map((kind) => ({ kind, params: {} })),
  };
}

function makeState(
  executionPlan: ExecutionPlan,
  policyRef: PolicyRef,
  currentMode?: string
): GraphState {
  return {
    userInput: "Please answer",
    executionPlan,
    policyRef,
    currentMode,
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

function makeDeps(memoryRepo: SpyMemoryRepo): PlanExecutorDeps {
  return {
    llmClient: {
      async generate(prompt: string): Promise<string> {
        return `LLM:${prompt}`;
      },
    },
    memoryRepo,
  };
}

function createRegistryWithExecutors(
  executors: Readonly<Record<string, StepExecutor>>
) {
  const registry = createStepExecutorRegistry();
  for (const [kind, executor] of Object.entries(executors)) {
    registry.register(kind, executor);
  }
  return registry;
}

test("T1: core does not branch on currentMode", async () => {
  const plan = makePlan([
    "LoadDocsForMode",
    "ContextSelect",
    "PromptAssemble",
    "LLMCall",
    "MemoryWrite",
  ]);
  const policyRef = Object.freeze({
    policyId: "policy-alpha",
    docBundleRefs: Object.freeze(["doc-1.md", "doc-2.md"]),
  });

  const callsA: string[] = [];
  const callsB: string[] = [];

  const wrappedExecutorsA: Record<string, StepExecutor> = {};
  for (const [kind, executor] of Object.entries(coreStepExecutors)) {
    wrappedExecutorsA[kind] = async (state, step, deps) => {
      callsA.push(kind);
      return executor(state, step, deps);
    };
  }

  const wrappedExecutorsB: Record<string, StepExecutor> = {};
  for (const [kind, executor] of Object.entries(coreStepExecutors)) {
    wrappedExecutorsB[kind] = async (state, step, deps) => {
      callsB.push(kind);
      return executor(state, step, deps);
    };
  }

  const depsA = makeDeps(new SpyMemoryRepo());
  const depsB = makeDeps(new SpyMemoryRepo());

  const resultA = await executePlan(
    plan,
    makeState(plan, policyRef, "A"),
    depsA,
    createRegistryWithExecutors(wrappedExecutorsA)
  );
  const resultB = await executePlan(
    plan,
    makeState(plan, policyRef, "B"),
    depsB,
    createRegistryWithExecutors(wrappedExecutorsB)
  );

  assert.deepEqual(callsA, plan.steps.map((step) => String(step.kind)));
  assert.deepEqual(callsA, callsB);
  assert.equal(resultA.lastResponse, resultB.lastResponse);
});

test("T2: only steps in executionPlan are executed", async () => {
  const plan = makePlan(["LLMCall"]);
  const counts = {
    LoadDocsForMode: 0,
    ContextSelect: 0,
    PromptAssemble: 0,
    LLMCall: 0,
    MemoryWrite: 0,
  };

  const executors: Record<string, StepExecutor> = {
    LoadDocsForMode: async () => {
      counts.LoadDocsForMode += 1;
      return { kind: "ok" };
    },
    ContextSelect: async () => {
      counts.ContextSelect += 1;
      return { kind: "ok" };
    },
    PromptAssemble: async () => {
      counts.PromptAssemble += 1;
      return { kind: "ok" };
    },
    LLMCall: async () => {
      counts.LLMCall += 1;
      return { kind: "ok", patch: { lastResponse: "ok" }, data: "ok" };
    },
    MemoryWrite: async () => {
      counts.MemoryWrite += 1;
      return { kind: "ok" };
    },
  };

  const result = await executePlan(
    plan,
    {
      ...makeState(plan, Object.freeze({ policyId: "policy-alpha" })),
      assembledPrompt: "already-assembled",
    },
    makeDeps(new SpyMemoryRepo()),
    createRegistryWithExecutors(executors)
  );

  assert.equal(result.lastResponse, "ok");
  assert.equal(counts.LoadDocsForMode, 0);
  assert.equal(counts.ContextSelect, 0);
  assert.equal(counts.PromptAssemble, 0);
  assert.equal(counts.MemoryWrite, 0);
  assert.equal(counts.LLMCall, 1);
});

test("T4: policyRef remains immutable through execution", async () => {
  const plan = makePlan([
    "LoadDocsForMode",
    "ContextSelect",
    "PromptAssemble",
    "LLMCall",
    "MemoryWrite",
  ]);
  const policyRef = Object.freeze({
    policyId: "policy-alpha",
    docBundleRefs: Object.freeze(["bundle.md"]),
  });

  const result = await executePlan(
    plan,
    makeState(plan, policyRef),
    makeDeps(new SpyMemoryRepo()),
    createRegistryWithExecutors(coreStepExecutors)
  );

  assert.equal(Object.isFrozen(policyRef), true);
  assert.equal(result.policyRef, policyRef);
  assert.equal(result.lastResponse?.startsWith("LLM:"), true);
});

test("guard: empty executionPlan fails fast", async () => {
  const emptyPlan = makePlan([]);

  await assert.rejects(
    async () => {
      await executePlan(
        emptyPlan,
        makeState(emptyPlan, Object.freeze({ policyId: "policy-alpha" })),
        makeDeps(new SpyMemoryRepo()),
        createRegistryWithExecutors(coreStepExecutors)
      );
    },
    /executionPlan\.steps must not be empty/i
  );
});

test("domain lock: setDomain persists and RetrieveDecisionContext override is transient only", async () => {
  const plan: ExecutionPlan = {
    version: "1.0",
    steps: [
      { kind: "setDomain", params: { currentDomain: "coding" } },
      { kind: "RetrieveDecisionContext", params: { input: "hello", currentDomain: "ui" } },
      { kind: "RetrieveDecisionContext", params: { input: "hello" } },
    ],
  };
  const policyRef = Object.freeze({ policyId: "policy-alpha" });
  const retrievalDomains: Array<string | undefined> = [];
  const deps: PlanExecutorDeps = {
    ...makeDeps(new SpyMemoryRepo()),
    retrieveDecisionContext: ({ currentDomain }) => {
      retrievalDomains.push(currentDomain);
      return { decisions: [], anchors: [] };
    },
  };

  const result = await executePlan(
    plan,
    makeState(plan, policyRef),
    deps,
    createRegistryWithExecutors(coreStepExecutors)
  );

  assert.equal(result.currentDomain, "coding");
  assert.deepEqual(retrievalDomains, ["ui", "coding"]);
});
