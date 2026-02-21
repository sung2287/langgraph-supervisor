/**
 * Intent: PRD-005 engine lock — domain/scope retrieval and contamination guards must be enforced at engine layer.
 * Scope: Decision context service sequencing, scope allowlist fail-fast, memory contamination fail-fast, and anchor soft integrity.
 * Non-Goals: PRD-006 schema boot/index testing or implementing storage business logic.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSQLiteStorageLayer } from "../../src/adapter/storage/sqlite";
import {
  retrieveDecisionContextHierarchically,
  type DecisionStorePort,
} from "../../src/core/decision/decision_context.service";
import { executePlan } from "../../src/core/plan/plan.executor";
import { coreStepExecutors } from "../../src/core/plan/plan.handlers";
import { FailFastError } from "../../src/core/plan/errors";
import type {
  ExecutionPlanV1,
  GraphState,
  PlanExecutorDeps,
  StepDefinition,
} from "../../src/core/plan/plan.types";
import {
  createStepExecutorRegistry,
  type StepExecutor,
} from "../../src/core/plan/step.registry";

function createTempDb(t: test.TestContext): { readonly dir: string; readonly dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prd005-engine-it-"));
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

function makeState(plan: ExecutionPlanV1): GraphState {
  return {
    userInput: "hello",
    executionPlan: plan,
    policyRef: Object.freeze({ policyId: "policy" }),
    projectId: "test-project",
    currentMode: "test",
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

test("1) domain default: undefined currentDomain loads only global+axis", (t) => {
  const { dbPath } = createTempDb(t);
  const layer = createSQLiteStorageLayer({ dbPath });
  layer.storage.connect();
  t.after(() => layer.storage.close());

  layer.decisionStore.insertDecisionV1({
    id: "G1",
    rootId: "G1",
    version: 1,
    text: "global axis",
    strength: "axis",
    scope: "global",
  });
  layer.decisionStore.insertDecisionV1({
    id: "C1",
    rootId: "C1",
    version: 1,
    text: "coding axis",
    strength: "axis",
    scope: "coding",
  });
  layer.decisionStore.insertDecisionV1({
    id: "C2",
    rootId: "C2",
    version: 1,
    text: "coding lock",
    strength: "lock",
    scope: "coding",
  });

  const result = retrieveDecisionContextHierarchically(
    layer.decisionStore as unknown as DecisionStorePort,
    {
    currentDomain: undefined,
    }
  );

  assert.deepEqual(result.decisions.map((item) => item.id), ["G1"]);
  assert.deepEqual(result.anchors, []);
});

test("2) hierarchical retrieval: 4-step sequential calls and merged order", (t) => {
  const { dbPath } = createTempDb(t);
  const layer = createSQLiteStorageLayer({ dbPath });
  layer.storage.connect();
  t.after(() => layer.storage.close());

  layer.decisionStore.insertDecisionV1({
    id: "G1",
    rootId: "G1",
    version: 1,
    text: "global axis",
    strength: "axis",
    scope: "global",
  });
  layer.decisionStore.insertDecisionV1({
    id: "C1",
    rootId: "C1",
    version: 1,
    text: "coding axis",
    strength: "axis",
    scope: "coding",
  });
  layer.decisionStore.insertDecisionV1({
    id: "C2",
    rootId: "C2",
    version: 1,
    text: "coding lock",
    strength: "lock",
    scope: "coding",
  });
  layer.decisionStore.insertDecisionV1({
    id: "C3",
    rootId: "C3",
    version: 1,
    text: "coding normal",
    strength: "normal",
    scope: "coding",
  });

  const calls: Array<readonly [string, string]> = [];
  const storeSpy = {
    getActiveByScopeStrength(scope: string, strength: "axis" | "lock" | "normal") {
      calls.push([scope, strength]);
      return layer.decisionStore
        .getActiveByScopeStrength(scope, strength)
        .map((row) => ({ ...row }));
    },
  };

  const result = retrieveDecisionContextHierarchically(storeSpy, {
    currentDomain: "coding",
  });

  assert.deepEqual(calls, [
    ["global", "axis"],
    ["coding", "axis"],
    ["coding", "lock"],
    ["coding", "normal"],
  ]);
  assert.deepEqual(result.decisions.map((item) => item.id), ["G1", "C1", "C2", "C3"]);
});

test("3) scope allowlist: invalid decision scope fails fast before persistence", async (t) => {
  const { dbPath } = createTempDb(t);
  const layer = createSQLiteStorageLayer({ dbPath });
  layer.storage.connect();
  t.after(() => layer.storage.close());

  const plan = makePlan({
    version: "1.1",
    steps: [
      { id: "s1", type: "ContextSelect", payload: { input: "hi", sources: [] } },
      { id: "s2", type: "PromptAssemble", payload: {} },
      { id: "s3", type: "LLMCall", payload: {} },
      {
        id: "s4",
        type: "PersistDecision",
        payload: {
          decision: {
            id: "d1",
            rootId: "d1",
            version: 1,
            text: "invalid scope",
            strength: "axis",
            scope: "unknown",
            isActive: true,
          },
        },
      },
      { id: "s5", type: "PersistSession", payload: { sessionRef: "s", meta: {} } },
    ],
  });

  await assert.rejects(
    () => executePlan(plan, makeState(plan), makeDeps(), makeRegistry()),
    (error: unknown) =>
      error instanceof FailFastError && /DECISION_SCOPE_INVALID/.test(error.message)
  );

  const decisionCount =
    layer.storage.query<Record<string, unknown>>("SELECT COUNT(*) AS c FROM decisions")[0] ?? {};
  const evidenceCount =
    layer.storage.query<Record<string, unknown>>("SELECT COUNT(*) AS c FROM evidences")[0] ?? {};
  assert.equal(Number(decisionCount.c ?? 0), 0);
  assert.equal(Number(evidenceCount.c ?? 0), 0);
});

test("4) summary contamination guard: forbidden memory keys fail fast", async (t) => {
  const { dbPath } = createTempDb(t);
  const layer = createSQLiteStorageLayer({ dbPath });
  layer.storage.connect();
  t.after(() => layer.storage.close());

  const plan = makePlan({
    version: "1",
    steps: [
      { id: "s1", type: "ContextSelect", payload: { input: "hi", sources: [] } },
      { id: "s2", type: "PromptAssemble", payload: {} },
      { id: "s3", type: "LLMCall", payload: {} },
      {
        id: "s4",
        type: "PersistMemory",
        payload: {
          summary: "forbidden",
          keywords: ["forbidden"],
        },
      },
      { id: "s5", type: "PersistSession", payload: { sessionRef: "s", meta: {} } },
    ],
  });

  await assert.rejects(
    () => executePlan(plan, makeState(plan), makeDeps(), makeRegistry()),
    (error: unknown) =>
      error instanceof FailFastError && /MEMORY_WRITE_FORBIDDEN_PAYLOAD_KEYS/.test(error.message)
  );

  const decisionCount =
    layer.storage.query<Record<string, unknown>>("SELECT COUNT(*) AS c FROM decisions")[0] ?? {};
  const evidenceCount =
    layer.storage.query<Record<string, unknown>>("SELECT COUNT(*) AS c FROM evidences")[0] ?? {};
  assert.equal(Number(decisionCount.c ?? 0), 0);
  assert.equal(Number(evidenceCount.c ?? 0), 0);
});

test("5) anchor soft integrity: missing targetRef must not fail fast", (t) => {
  const { dbPath } = createTempDb(t);
  const layer = createSQLiteStorageLayer({ dbPath });
  layer.storage.connect();
  t.after(() => layer.storage.close());

  assert.doesNotThrow(() => {
    layer.anchorStore.insertAnchor({
      id: "a-soft",
      hint: "broken allowed",
      targetRef: "missing-target-id",
      type: "decision_link",
    });
  });

  const anchorCount =
    layer.storage.query<Record<string, unknown>>(
      "SELECT COUNT(*) AS c FROM anchors WHERE id = ?",
      ["a-soft"]
    )[0] ?? {};
  assert.equal(Number(anchorCount.c ?? 0), 1);
});
