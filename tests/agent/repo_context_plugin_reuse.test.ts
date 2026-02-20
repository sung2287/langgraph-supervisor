/** Intent: PRD-003 snapshot reuse lock — repo_context stub reuses fresh ops/runtime artifact without rescanning. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
import { registerRepositoryPluginExecutors } from "../../src/plugin/repository/index";

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

test("stub executor: fresh ops/runtime snapshot is reused", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-context-plugin-"));
  const runtimeDir = path.join(repoRoot, "ops", "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  const artifactPath = path.join(runtimeDir, "scan-result.json");

  const artifact = {
    scanVersion: "scan-v1",
    scanVersionMs: 1000,
    fileIndex: ["README.md"],
  };
  fs.writeFileSync(artifactPath, JSON.stringify(artifact), "utf8");

  const plan = makePlanWithRepoStep();
  const registry = registerCoreExecutors();
  registerRepositoryPluginExecutors(registry, {
    repoRoot,
    nowMs: () => 1500,
  });

  const result = await executePlan(
    plan,
    makeState(plan, Object.freeze({ policyId: "policy-alpha" })),
    makeDeps(new SpyMemoryRepo()),
    registry
  );

  assert.equal(result.repoScanVersion, "scan-v1");
  assert.equal(result.repoContextArtifactPath, path.resolve(repoRoot, "ops/runtime/scan-result.json"));
  assert.equal(result.repoContextUnavailableReason, undefined);
  assert.deepEqual(result.stepResults?.repo_context, artifact);
  assert.equal(result.lastResponse?.startsWith("LLM:"), true);
});
