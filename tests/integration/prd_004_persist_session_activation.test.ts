/**
 * Intent: PRD-004 PersistSession activation lock — session persistence must execute via Step path and fail fast on write errors.
 * Scope: Runtime plan normalization + executor wiring proof for PersistSession file persistence.
 * Non-Goals: PRD-005/006 retrieval/storage logic redesign or policy algorithm changes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { toCoreExecutionPlan } from "../../runtime/graph/graph";
import { executePlan } from "../../src/core/plan/plan.executor";
import { coreStepExecutors } from "../../src/core/plan/plan.handlers";
import { createStepExecutorRegistry } from "../../src/core/plan/step.registry";
import { createRuntimePlanExecutorDeps } from "../../runtime/graph/plan_executor_deps";
import { createSQLiteStorageLayer } from "../../src/adapter/storage/sqlite";
import { FileSessionStore, SESSION_STATE_REL_PATH } from "../../src/session/file_session.store";
import { FailFastError } from "../../src/core/plan/errors";
import { PolicyInterpreter } from "../../src/policy/interpreter/policy.interpreter";
import {
  isExecutionPlanV1 as isCorePlanV1,
  type ExecutionPlanV1,
  type GraphState,
} from "../../src/core/plan/plan.types";

class NoopMemoryRepo {
  async write(): Promise<void> {
    return;
  }
}

function createTempRoot(t: test.TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prd004-session-it-"));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function makeRegistry() {
  const registry = createStepExecutorRegistry();
  for (const [kind, executor] of Object.entries(coreStepExecutors)) {
    registry.register(kind, executor);
  }
  return registry;
}

function makeState(plan: ExecutionPlanV1, projectId: string): GraphState {
  return {
    userInput: "테스트",
    executionPlan: plan,
    policyRef: Object.freeze({ policyId: "policy-default" }),
    projectId,
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

function makeCorePlanWithoutPersistSession(): ExecutionPlanV1 {
  const interpreter = new PolicyInterpreter({
    repoRoot: process.cwd(),
    profile: "default",
  });
  const normalizedPlan = interpreter.resolveExecutionPlan({ userInput: "테스트" });
  const corePlan = toCoreExecutionPlan(normalizedPlan);
  if (!isCorePlanV1(corePlan)) {
    assert.fail("expected step contract v1 plan");
  }
  return corePlan;
}

test("PersistSession mandatory is auto-emitted and writes session_state.json via Step", async (t) => {
  const root = createTempRoot(t);
  const dbPath = path.join(root, "db", "runtime.db");
  const storageLayer = createSQLiteStorageLayer({ dbPath });
  storageLayer.storage.connect();
  t.after(() => storageLayer.storage.close());

  const corePlan = makeCorePlanWithoutPersistSession();
  assert.equal(corePlan.steps.some((step) => step.type === "PersistSession"), true);

  await executePlan(
    corePlan,
    makeState(corePlan, root),
    createRuntimePlanExecutorDeps({
      llmClient: {
        async generate(prompt: string): Promise<string> {
          return `LLM:${prompt}`;
        },
      },
      memoryRepo: new NoopMemoryRepo(),
      storageLayer,
      sessionStore: new FileSessionStore(root),
      expectedHash: "hash-prd004",
      loadedSession: null,
    }),
    makeRegistry()
  );

  const targetPath = path.resolve(root, SESSION_STATE_REL_PATH);
  assert.equal(fs.existsSync(targetPath), true);
  const serialized = fs.readFileSync(targetPath, "utf8");
  assert.equal(serialized.trim().length > 0, true);
  const parsed = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal(typeof parsed.sessionId, "string");
  assert.equal(typeof parsed.lastExecutionPlanHash, "string");
});

test("PersistSession write failure is Fail-Fast and leaves no temp artifact", async (t) => {
  if (process.platform === "win32") {
    t.skip("permission-based write failure is unstable on Windows");
    return;
  }

  const root = createTempRoot(t);
  const runtimeDir = path.join(root, "ops", "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.chmodSync(runtimeDir, 0o500);
  t.after(() => {
    try {
      fs.chmodSync(runtimeDir, 0o700);
    } catch {
      // best-effort restore for cleanup
    }
  });

  const dbPath = path.join(root, "db", "runtime.db");
  const storageLayer = createSQLiteStorageLayer({ dbPath });
  storageLayer.storage.connect();
  t.after(() => storageLayer.storage.close());

  const corePlan = makeCorePlanWithoutPersistSession();

  await assert.rejects(
    () =>
      executePlan(
        corePlan,
        makeState(corePlan, root),
        createRuntimePlanExecutorDeps({
          llmClient: {
            async generate(prompt: string): Promise<string> {
              return `LLM:${prompt}`;
            },
          },
          memoryRepo: new NoopMemoryRepo(),
          storageLayer,
          sessionStore: new FileSessionStore(root),
          expectedHash: "hash-prd004",
          loadedSession: null,
        }),
        makeRegistry()
      ),
    (error: unknown) => error instanceof FailFastError
  );

  const files = fs.readdirSync(runtimeDir);
  assert.equal(files.some((name) => name.startsWith("session_state.json.tmp-")), false);
  assert.equal(files.includes("session_state.json"), false);
});
