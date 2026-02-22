/**
 * Intent: PRD-012A deterministic plan hash lock — stable serialization must be key-order invariant and domain/provider/model/mode sensitive.
 * Scope: `stableStringify` and `computeExecutionPlanHash` behavior for determinism and metadata-aware hash boundaries.
 * Non-Goals: Session file I/O lifecycle or provider network execution.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { ExecutionPlanV1, PolicyRef } from "../../src/core/plan/plan.types";
import {
  computeExecutionPlanHash,
  type ExecutionContextMetadata,
} from "../../src/session/execution_plan_hash";
import { stableStringify } from "../../src/session/stable_stringify";

function buildPlanWithOrder(order: "ab" | "ba"): ExecutionPlanV1 {
  const payloadObject =
    order === "ab"
      ? ({ alpha: "A", beta: "B" } as const)
      : ({ beta: "B", alpha: "A" } as const);
  const nestedObject =
    order === "ab"
      ? ({ k1: "v1", k2: "v2" } as const)
      : ({ k2: "v2", k1: "v1" } as const);

  return {
    step_contract_version: "1.1",
    extensions: [],
    metadata: {
      policyProfile: "default",
      mode: "default",
      topK: 3,
    },
    steps: [
      {
        id: "s1",
        type: "ContextSelect",
        payload: {
          input: "hello",
          attrs: payloadObject,
          list: [nestedObject],
        },
      },
      {
        id: "s2",
        type: "PromptAssemble",
        payload: {
          template: "x",
        },
      },
      {
        id: "s3",
        type: "LLMCall",
        payload: {
          stream: false,
        },
      },
      {
        id: "s4",
        type: "PersistSession",
        payload: {
          sessionRef: "default",
          meta: {},
        },
      },
    ],
  };
}

function buildPolicyRef(order: "ab" | "ba"): PolicyRef {
  if (order === "ab") {
    return Object.freeze({
      policyId: "default",
      modeLabel: "default",
      docBundleRefs: ["docs/a.md", "docs/b.md"],
    });
  }
  return Object.freeze({
    modeLabel: "default",
    docBundleRefs: ["docs/a.md", "docs/b.md"],
    policyId: "default",
  });
}

function metadata(overrides: Partial<ExecutionContextMetadata> = {}): ExecutionContextMetadata {
  return {
    provider: "gemini",
    model: "gemini-2.5-flash",
    mode: "default",
    domain: "global",
    ...overrides,
  };
}

test("determinism: same input hashed 100 times yields one stable value", () => {
  const plan = buildPlanWithOrder("ab");
  const policyRef = buildPolicyRef("ab");
  const inputMetadata = metadata();

  const hashes = new Set<string>();
  for (let idx = 0; idx < 100; idx += 1) {
    hashes.add(
      computeExecutionPlanHash({
        executionPlan: plan,
        policyRef,
        metadata: inputMetadata,
      })
    );
  }

  assert.equal(hashes.size, 1);
});

test("key-order invariance: stableStringify and hash ignore object insertion order", () => {
  const planA = buildPlanWithOrder("ab");
  const planB = buildPlanWithOrder("ba");
  const policyRefA = buildPolicyRef("ab");
  const policyRefB = buildPolicyRef("ba");
  const inputMetadata = metadata();

  const serializedA = stableStringify({
    executionPlan: planA,
    policyRef: policyRefA,
    metadata: inputMetadata,
  });
  const serializedB = stableStringify({
    executionPlan: planB,
    policyRef: policyRefB,
    metadata: inputMetadata,
  });
  assert.equal(serializedA, serializedB);

  const hashA = computeExecutionPlanHash({
    executionPlan: planA,
    policyRef: policyRefA,
    metadata: inputMetadata,
  });
  const hashB = computeExecutionPlanHash({
    executionPlan: planB,
    policyRef: policyRefB,
    metadata: inputMetadata,
  });
  assert.equal(hashA, hashB);
});

test("sensitivity: domain/provider/model/mode changes each alter hash", () => {
  const executionPlan = buildPlanWithOrder("ab");
  const policyRef = buildPolicyRef("ab");

  const baseHash = computeExecutionPlanHash({
    executionPlan,
    policyRef,
    metadata: metadata(),
  });

  const domainHash = computeExecutionPlanHash({
    executionPlan,
    policyRef,
    metadata: metadata({ domain: "payments" }),
  });
  const providerHash = computeExecutionPlanHash({
    executionPlan,
    policyRef,
    metadata: metadata({ provider: "openai" }),
  });
  const modelHash = computeExecutionPlanHash({
    executionPlan,
    policyRef,
    metadata: metadata({ model: "gemini-2.5-pro" }),
  });
  const modeHash = computeExecutionPlanHash({
    executionPlan,
    policyRef,
    metadata: metadata({ mode: "diagnose" }),
  });

  assert.notEqual(domainHash, baseHash);
  assert.notEqual(providerHash, baseHash);
  assert.notEqual(modelHash, baseHash);
  assert.notEqual(modeHash, baseHash);
});
