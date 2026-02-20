import { createBuiltinHandlers } from "./plan.handlers";
import type { GraphState, PlanExecutorDeps } from "./plan.types";
import { applyPatch, dispatchStep, type StepHandlerRegistry } from "./step.registry";

function assertRunnable(state: GraphState): void {
  if (!state.policyRef || typeof state.policyRef !== "object") {
    throw new Error("PLAN_EXECUTION_ERROR policyRef must be resolved before Core execution");
  }

  if (!Array.isArray(state.executionPlan.steps) || state.executionPlan.steps.length === 0) {
    throw new Error("PLAN_EXECUTION_ERROR executionPlan.steps must not be empty");
  }
}

export async function executePlan(
  state: GraphState,
  deps: PlanExecutorDeps,
  handlers: StepHandlerRegistry = createBuiltinHandlers()
): Promise<GraphState> {
  assertRunnable(state);

  let nextState: GraphState = {
    ...state,
    stepLog: [...state.stepLog],
  };

  for (const step of state.executionPlan.steps) {
    const patch = await dispatchStep(nextState, step, deps, handlers);
    nextState = applyPatch(nextState, patch);
    nextState = {
      ...nextState,
      stepLog: [...nextState.stepLog, step.type],
    };
  }

  return nextState;
}
