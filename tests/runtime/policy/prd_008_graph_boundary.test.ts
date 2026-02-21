/**
 * Intent: PRD-008 normalization boundary lock — graph must execute already-normalized plans and must not perform legacy step mapping.
 * Scope: runtime graph bridge function behavior (`toCoreExecutionPlan`) with normalized input only.
 * Non-Goals: Core step validation semantics or PolicyInterpreter trigger resolution rules.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { toCoreExecutionPlan } from "../../../runtime/graph/graph";
import { PolicyInterpreter } from "../../../src/policy/interpreter/policy.interpreter";
import type { NormalizedExecutionPlan } from "../../../src/policy/schema/policy.types";
import { isExecutionPlanV1 } from "../../../src/core/plan/plan.types";


test("graph bridge: accepts normalized execution plan without mutating step types", () => {
  const interpreter = new PolicyInterpreter({
    repoRoot: process.cwd(),
    profile: "default",
  });
  const normalized = interpreter.resolveExecutionPlan({ userInput: "diag: check" });

  const corePlan = toCoreExecutionPlan(normalized);
  assert.equal(isExecutionPlanV1(corePlan), true);
  if (!isExecutionPlanV1(corePlan)) {
    assert.fail("expected contract v1 plan");
  }

  assert.deepEqual(
    corePlan.steps.map((step) => step.type),
    normalized.steps.map((step) => step.type)
  );
  assert.equal(corePlan.step_contract_version, normalized.step_contract_version);
  assert.deepEqual(corePlan.extensions, []);
});

test("graph bridge: legacy policy plan shape is rejected", () => {
  const legacyLike = {
    version: "1.0",
    steps: [{ type: "recall", params: {} }],
    metadata: {
      policyId: "default",
      modeLabel: "default",
    },
  } as unknown as NormalizedExecutionPlan;

  assert.throws(
    () => toCoreExecutionPlan(legacyLike),
    /PLAN_NORMALIZATION_ERROR metadata\.mode must be provided/
  );
});
