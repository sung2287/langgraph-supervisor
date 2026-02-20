/** Intent: PRD-003 Route B lock — #rescan triggers scan/write, enforces ignore filtering, deterministic ordering, and write confinement to ops/runtime. */
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

function makePlan(): ExecutionPlan {
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

function makeState(plan: ExecutionPlan, policyRef: PolicyRef): GraphState {
  return {
    userInput: "implement this #rescan",
    executionPlan: plan,
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

function writeFile(rootAbs: string, relPath: string, content: string): void {
  const absPath = path.join(rootAbs, ...relPath.split("/"));
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf8");
}

function listFiles(rootAbs: string): string[] {
  const out: string[] = [];

  function walk(dirAbs: string): void {
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (entry.isFile()) {
        const rel = path.relative(rootAbs, abs).split(path.sep).join("/");
        out.push(rel);
      }
    }
  }

  walk(rootAbs);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

test("executor: #rescan creates snapshot and writes only ops/runtime/scan-result.json", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-context-rescan-"));
  try {
    writeFile(repoRoot, "src/keep.ts", "ok");
    writeFile(repoRoot, "README.md", "readme");
    writeFile(repoRoot, "node_modules/x/index.js", "ignored");
    writeFile(repoRoot, ".git/y", "ignored");
    writeFile(repoRoot, "ops/runtime/z", "ignored");

    const beforeFiles = listFiles(repoRoot);

    const plan = makePlan();
    const registry = registerCoreExecutors();
    registerRepositoryPluginExecutors(registry, {
      repoRoot,
      nowMs: () => 123456,
    });

    const result = await executePlan(
      plan,
      makeState(plan, Object.freeze({ policyId: "policy-alpha" })),
      makeDeps(new SpyMemoryRepo()),
      registry
    );

    const scanPath = path.join(repoRoot, ...SCAN_RESULT_REL_PATH.split("/"));
    assert.equal(fs.existsSync(scanPath), true);

    const saved = JSON.parse(fs.readFileSync(scanPath, "utf8")) as {
      schemaVersion: number;
      scanVersionMs: number;
      fileIndex: Array<{ path: string }>;
    };

    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.scanVersionMs, 123456);

    const savedPaths = saved.fileIndex.map((entry) => entry.path);
    const sorted = [...savedPaths].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(savedPaths, sorted);

    assert.equal(savedPaths.includes("src/keep.ts"), true);
    assert.equal(savedPaths.includes("README.md"), true);
    assert.equal(savedPaths.some((p) => p.startsWith("node_modules/")), false);
    assert.equal(savedPaths.some((p) => p.startsWith(".git/")), false);
    assert.equal(savedPaths.some((p) => p.startsWith("ops/runtime/")), false);

    const afterFiles = listFiles(repoRoot);
    const created = afterFiles.filter((f) => !beforeFiles.includes(f));
    assert.deepEqual(created, ["ops/runtime/scan-result.json"]);

    assert.equal(result.repoScanVersion, "123456");
    assert.equal(result.repoContextUnavailableReason, undefined);
    assert.equal(result.lastResponse?.startsWith("LLM:"), true);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
