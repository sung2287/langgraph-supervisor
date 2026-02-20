/** Intent: PRD-001 core runtime skeleton lock — executor neutrality, strict step execution, and policyRef immutability. */
import test from "node:test";
import assert from "node:assert/strict";
import { executePlan } from "../../src/core/plan/plan.executor";
import { createBuiltinHandlers } from "../../src/core/plan/plan.handlers";
import type {
  ExecutionPlan,
  GraphState,
  MemoryWriteRecord,
  PlanExecutorDeps,
  PolicyRef,
} from "../../src/core/plan/plan.types";
import type { StepHandlerRegistry } from "../../src/core/plan/step.registry";

class SpyMemoryRepo {
  readonly writes: MemoryWriteRecord[] = [];

  async write(record: MemoryWriteRecord): Promise<void> {
    this.writes.push(record);
  }
}

function makePlan(stepTypes: readonly string[]): ExecutionPlan {
  return {
    version: "1.0",
    steps: stepTypes.map((type) => ({ type, params: {} })),
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

function withRecorder(
  handlers: StepHandlerRegistry,
  calls: string[]
): StepHandlerRegistry {
  const wrapped: Record<string, StepHandlerRegistry[string]> = {};

  for (const [type, handler] of Object.entries(handlers)) {
    wrapped[type] = async (state, step, deps) => {
      calls.push(step.type);
      return handler(state, step, deps);
    };
  }

  return wrapped;
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
  const depsA = makeDeps(new SpyMemoryRepo());
  const depsB = makeDeps(new SpyMemoryRepo());

  const resultA = await executePlan(
    makeState(plan, policyRef, "A"),
    depsA,
    withRecorder(createBuiltinHandlers(), callsA)
  );
  const resultB = await executePlan(
    makeState(plan, policyRef, "B"),
    depsB,
    withRecorder(createBuiltinHandlers(), callsB)
  );

  assert.deepEqual(callsA, plan.steps.map((step) => step.type));
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

  const handlers: StepHandlerRegistry = {
    LoadDocsForMode: async () => {
      counts.LoadDocsForMode += 1;
      return {};
    },
    ContextSelect: async () => {
      counts.ContextSelect += 1;
      return {};
    },
    PromptAssemble: async () => {
      counts.PromptAssemble += 1;
      return {};
    },
    LLMCall: async () => {
      counts.LLMCall += 1;
      return { lastResponse: "ok" };
    },
    MemoryWrite: async () => {
      counts.MemoryWrite += 1;
      return {};
    },
  };

  const result = await executePlan(
    {
      ...makeState(plan, Object.freeze({ policyId: "policy-alpha" })),
      assembledPrompt: "already-assembled",
    },
    makeDeps(new SpyMemoryRepo()),
    handlers
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
  const deps = makeDeps(new SpyMemoryRepo());

  const result = await executePlan(
    makeState(plan, policyRef),
    deps,
    createBuiltinHandlers()
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
        makeState(emptyPlan, Object.freeze({ policyId: "policy-alpha" })),
        makeDeps(new SpyMemoryRepo()),
        createBuiltinHandlers()
      );
    },
    /executionPlan\.steps must not be empty/i
  );
});
