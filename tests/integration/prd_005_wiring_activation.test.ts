/**
 * Intent: PRD-005 runtime wiring lock — runtime deps must activate decision retrieval/persistence with domain and contamination guards intact.
 * Scope: Thin integration proof for RetrieveDecisionContext/PersistDecision wiring through PlanExecutor using temp SQLite storage.
 * Non-Goals: Expanding storage schema tests or redesigning engine/service internals.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executePlan } from "../../src/core/plan/plan.executor";
import { coreStepExecutors } from "../../src/core/plan/plan.handlers";
import { createStepExecutorRegistry } from "../../src/core/plan/step.registry";
import { createSQLiteStorageLayer } from "../../src/adapter/storage/sqlite";
import { FailFastError } from "../../src/core/plan/errors";
import { createRuntimePlanExecutorDeps } from "../../runtime/graph/plan_executor_deps";
import type {
  ExecutionPlanV1,
  GraphState,
  PlanExecutorDeps,
  StepDefinition,
} from "../../src/core/plan/plan.types";
import type { StepExecutor } from "../../src/core/plan/step.registry";

function createTempDb(t: test.TestContext): { readonly dir: string; readonly dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prd005-wiring-it-"));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    dir,
    dbPath: path.join(dir, "runtime.db"),
  };
}

function makeRegistry(overrides?: Readonly<Record<string, StepExecutor>>) {
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

class NoopMemoryRepo {
  async write(): Promise<void> {
    return;
  }
}

function makeRuntimeDeps(storageLayer: ReturnType<typeof createSQLiteStorageLayer>): PlanExecutorDeps {
  return createRuntimePlanExecutorDeps({
    llmClient: {
      async generate(prompt: string): Promise<string> {
        return `LLM:${prompt}`;
      },
    },
    memoryRepo: new NoopMemoryRepo(),
    storageLayer,
  });
}

function makePlan(input: {
  readonly version: "1" | "1.1";
  readonly steps: readonly StepDefinition[];
}): ExecutionPlanV1 {
  return {
    step_contract_version: input.version,
    extensions: [],
    metadata: {
      policyProfile: "policy",
      mode: "mode",
    },
    steps: input.steps,
  };
}

function makeState(plan: ExecutionPlanV1, currentDomain?: string): GraphState {
  return {
    userInput: "hello",
    executionPlan: plan,
    policyRef: Object.freeze({ policyId: "policy" }),
    currentMode: "test",
    currentDomain,
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

function extractDecisionIds(result: GraphState, stepId: string): readonly string[] {
  const raw = (result.stepResults ?? {})[stepId] as Record<string, unknown> | undefined;
  const decisions = Array.isArray(raw?.decisions)
    ? (raw?.decisions as Array<Record<string, unknown>>)
    : [];
  return decisions
    .map((decision) => (typeof decision.id === "string" ? decision.id : ""))
    .filter((id) => id !== "");
}

test("1) wiring live: RetrieveDecisionContext returns data (no NOT_IMPLEMENTED)", async (t) => {
  const { dbPath } = createTempDb(t);
  const storageLayer = createSQLiteStorageLayer({ dbPath });
  storageLayer.storage.connect();
  t.after(() => storageLayer.storage.close());

  storageLayer.decisionStore.insertDecisionV1({
    id: "G1",
    rootId: "G1",
    version: 1,
    text: "global axis",
    strength: "axis",
    scope: "global",
  });
  storageLayer.decisionStore.insertDecisionV1({
    id: "C1",
    rootId: "C1",
    version: 1,
    text: "coding axis",
    strength: "axis",
    scope: "coding",
  });

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
    makeState(plan, "coding"),
    makeRuntimeDeps(storageLayer),
    makeRegistry()
  );

  assert.deepEqual(extractDecisionIds(result, "s2"), ["G1", "C1"]);
  const step2 = (result.stepResults ?? {})["s2"];
  assert.equal(JSON.stringify(step2).includes("NOT_IMPLEMENTED_PRD005"), false);
});

test("2) wiring live: undefined currentDomain returns only global+axis", async (t) => {
  const { dbPath } = createTempDb(t);
  const storageLayer = createSQLiteStorageLayer({ dbPath });
  storageLayer.storage.connect();
  t.after(() => storageLayer.storage.close());

  storageLayer.decisionStore.insertDecisionV1({
    id: "G1",
    rootId: "G1",
    version: 1,
    text: "global axis",
    strength: "axis",
    scope: "global",
  });
  storageLayer.decisionStore.insertDecisionV1({
    id: "C1",
    rootId: "C1",
    version: 1,
    text: "coding axis",
    strength: "axis",
    scope: "coding",
  });

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
    makeState(plan, undefined),
    makeRuntimeDeps(storageLayer),
    makeRegistry()
  );

  assert.deepEqual(extractDecisionIds(result, "s2"), ["G1"]);
});

test("3) wiring live: PersistDecision writes to SQLite store", async (t) => {
  const { dbPath } = createTempDb(t);
  const storageLayer = createSQLiteStorageLayer({ dbPath });
  storageLayer.storage.connect();
  t.after(() => storageLayer.storage.close());

  const plan = makePlan({
    version: "1.1",
    steps: [
      { id: "s1", type: "ContextSelect", payload: { input: "hello", sources: [] } },
      { id: "s2", type: "PromptAssemble", payload: {} },
      { id: "s3", type: "LLMCall", payload: {} },
      {
        id: "s4",
        type: "PersistDecision",
        payload: {
          decision: {
            id: "D1",
            rootId: "D1",
            version: 1,
            text: "persist me",
            strength: "axis",
            scope: "coding",
            isActive: true,
          },
        },
      },
      { id: "s5", type: "PersistSession", payload: { sessionRef: "s", meta: {} } },
    ],
  });

  await executePlan(
    plan,
    makeState(plan, "coding"),
    makeRuntimeDeps(storageLayer),
    makeRegistry()
  );

  const countRow =
    storageLayer.storage.query<Record<string, unknown>>(
      "SELECT COUNT(*) AS c FROM decisions WHERE id = ? AND root_id = ? AND is_active = 1",
      ["D1", "D1"]
    )[0] ?? {};
  assert.equal(Number(countRow.c ?? 0), 1);
});

test("4) end-to-end guard: summary contamination still fails fast", async (t) => {
  const { dbPath } = createTempDb(t);
  const storageLayer = createSQLiteStorageLayer({ dbPath });
  storageLayer.storage.connect();
  t.after(() => storageLayer.storage.close());

  const plan = makePlan({
    version: "1",
    steps: [
      { id: "s1", type: "ContextSelect", payload: { input: "hello", sources: [] } },
      { id: "s2", type: "PromptAssemble", payload: {} },
      { id: "s3", type: "LLMCall", payload: {} },
      {
        id: "s4",
        type: "PersistMemory",
        payload: {
          summary: "forbidden",
        },
      },
      { id: "s5", type: "PersistSession", payload: { sessionRef: "s", meta: {} } },
    ],
  });

  await assert.rejects(
    () => executePlan(plan, makeState(plan, "coding"), makeRuntimeDeps(storageLayer), makeRegistry()),
    (error: unknown) =>
      error instanceof FailFastError && /MEMORY_WRITE_FORBIDDEN_PAYLOAD_KEYS/.test(error.message)
  );

  const decisionCount =
    storageLayer.storage.query<Record<string, unknown>>("SELECT COUNT(*) AS c FROM decisions")[0] ?? {};
  const evidenceCount =
    storageLayer.storage.query<Record<string, unknown>>("SELECT COUNT(*) AS c FROM evidences")[0] ?? {};
  assert.equal(Number(decisionCount.c ?? 0), 0);
  assert.equal(Number(evidenceCount.c ?? 0), 0);
});
