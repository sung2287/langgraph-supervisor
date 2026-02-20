import type {
  ExecutionPlan,
  GraphState,
  PlanExecutorDeps,
} from "./plan.types";
import { resolveStepKind } from "./plan.types";
import {
  applyPatch,
  type StatePatch,
  type StepExecutionResult,
  type StepExecutorRegistry,
} from "./step.registry";

function assertRunnable(plan: ExecutionPlan, state: GraphState): void {
  if (!state.policyRef || typeof state.policyRef !== "object") {
    throw new Error("PLAN_EXECUTION_ERROR policyRef must be resolved before Core execution");
  }

  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error("PLAN_EXECUTION_ERROR executionPlan.steps must not be empty");
  }
}

function mergeStepOutcome(
  state: GraphState,
  stepKind: string,
  result: StepExecutionResult
): GraphState {
  const nextState = applyPatch(state, result.patch);
  const stepResults = { ...(nextState.stepResults ?? {}) };
  const stepUnavailableReasons = { ...(nextState.stepUnavailableReasons ?? {}) };

  switch (result.kind) {
    case "ok": {
      if (typeof result.data !== "undefined") {
        stepResults[stepKind] = result.data;
      }
      break;
    }
    case "unavailable": {
      stepResults[stepKind] = {
        unavailable: true,
        reason: result.reason,
      };
      stepUnavailableReasons[stepKind] = result.reason;
      break;
    }
    case "error": {
      stepResults[stepKind] = {
        error: true,
        message: result.error.message,
        name: result.error.name,
      };
      stepUnavailableReasons[stepKind] = result.error.message;
      break;
    }
  }

  const outcomePatch: StatePatch = {
    stepResults,
    stepUnavailableReasons,
    actOutput: stepResults[stepKind],
  };

  return applyPatch(nextState, outcomePatch);
}

export async function executePlan(
  plan: ExecutionPlan,
  state: GraphState,
  deps: PlanExecutorDeps,
  registry: StepExecutorRegistry
): Promise<GraphState> {
  assertRunnable(plan, state);

  let nextState = applyPatch(state, {
    stepLog: [...state.stepLog],
  });

  for (const step of plan.steps) {
    const stepKind = resolveStepKind(step);
    if (stepKind === "") {
      throw new Error("PLAN_EXECUTION_ERROR step.kind or step.type must be a non-empty string");
    }

    const result = await registry.execute(stepKind, step, nextState, deps);
    nextState = mergeStepOutcome(nextState, stepKind, result);
    nextState = applyPatch(nextState, {
      stepLog: [...nextState.stepLog, stepKind],
    });
  }

  return nextState;
}
