/** Intent: PRD-003 snapshot reuse lock — fresh snapshot is reused without rescanning or rewriting scan-result.json. */
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
import { SCAN_RESULT_REL_PATH } from "../../src/plugin/repository/snapshot_manager";

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
          freshnessMs: 500,
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

test("executor: fresh snapshot reuse does not rewrite scan-result.json", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-context-plugin-"));
  try {
    const scanPath = path.join(repoRoot, ...SCAN_RESULT_REL_PATH.split("/"));
    fs.mkdirSync(path.dirname(scanPath), { recursive: true });

    const artifact = {
      schemaVersion: 1,
      createdAtMs: 1200,
      scanVersionMs: 1400,
      ignore: ["node_modules/**", ".git/**", "ops/runtime/**"],
      fileCount: 2,
      totalBytes: 20,
      marker: "fresh-only",
      fileIndex: [
        { path: "README.md", size: 10, mtimeMs: 1200 },
        { path: "src/a.ts", size: 10, mtimeMs: 1201 },
      ],
    };

    const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
    fs.writeFileSync(scanPath, serialized, "utf8");
    const beforeContent = fs.readFileSync(scanPath, "utf8");
    const beforeMtimeMs = fs.statSync(scanPath).mtimeMs;

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

    const afterText = fs.readFileSync(scanPath, "utf8");
    const afterMtimeMs = fs.statSync(scanPath).mtimeMs;

    assert.equal(afterText, beforeContent);
    assert.equal(Math.abs(afterMtimeMs - beforeMtimeMs) <= 1, true);

    const repoContext = result.stepResults?.repo_context as {
      scanVersionMs: number;
      fileCount: number;
      totalBytes: number;
      truncated: boolean;
      fileIndex: Array<{ path: string }>;
    };

    assert.equal(repoContext.scanVersionMs, 1400);
    assert.equal(repoContext.fileCount, 2);
    assert.equal(repoContext.totalBytes, 20);
    assert.equal(repoContext.truncated, false);

    assert.equal(result.repoScanVersion, "1400");
    assert.equal(result.repoContextArtifactPath, path.resolve(repoRoot, SCAN_RESULT_REL_PATH));
    assert.equal(result.repoContextUnavailableReason, undefined);
    assert.equal(result.lastResponse?.startsWith("LLM:"), true);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
