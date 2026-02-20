/** Intent: PRD-003 optional plugin lock — missing repo plugin returns unavailable and execution continues. */
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

class SpyMemoryRepo {
  readonly writes: MemoryWriteRecord[] = [];

  async write(record: MemoryWriteRecord): Promise<void> {
    this.writes.push(record);
  }
}

function makePlanWithRepoStep(): ExecutionPlan {
  return {
    version: "1.0",
    steps: [
      {
        kind: "repo_context",
        params: {
          storagePath: "ops/runtime/scan-result.json",
          freshnessMs: 600000,
          rescanTag: "#rescan",
          isFullScan: false,
        },
      },
      {
        kind: "LLMCall",
        params: {},
      },
    ],
  };
}

function makeState(executionPlan: ExecutionPlan, policyRef: PolicyRef): GraphState {
  return {
    userInput: "implement this change",
    executionPlan,
    policyRef,
    currentMode: "implement",
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

function registerCoreExecutors() {
  const registry = createStepExecutorRegistry();
  for (const [kind, executor] of Object.entries(coreStepExecutors)) {
    registry.register(kind, executor);
  }
  return registry;
}

test("plugin absent: repo kind becomes unavailable and execution continues", async () => {
  const plan = makePlanWithRepoStep();
  const registry = registerCoreExecutors();

  const result = await executePlan(
    plan,
    makeState(plan, Object.freeze({ policyId: "policy-alpha" })),
    makeDeps(new SpyMemoryRepo()),
    registry
  );

  assert.equal(typeof result.stepUnavailableReasons?.repo_context, "string");
  assert.deepEqual(result.stepResults?.repo_context, {
    unavailable: true,
    reason: result.stepUnavailableReasons?.repo_context,
  });
  assert.equal(result.lastResponse?.startsWith("LLM:"), true);
});
