import type { GraphState, PlanExecutorDeps, Step } from "./plan.types";

export type StatePatch = Partial<
  Omit<GraphState, "userInput" | "executionPlan" | "policyRef">
>;

export type StepHandler = (
  state: Readonly<GraphState>,
  step: Step,
  deps: PlanExecutorDeps
) => Promise<StatePatch | void> | StatePatch | void;

export type StepHandlerRegistry = Readonly<Record<string, StepHandler>>;

export async function dispatchStep(
  state: Readonly<GraphState>,
  step: Step,
  deps: PlanExecutorDeps,
  handlers: StepHandlerRegistry
): Promise<StatePatch | void> {
  const handler = handlers[step.type];
  if (!handler) {
    throw new Error(`PLAN_EXECUTION_ERROR unknown step type '${step.type}'`);
  }
  return handler(state, step, deps);
}

export function applyPatch(
  state: GraphState,
  patch: StatePatch | void
): GraphState {
  if (!patch) {
    return state;
  }

  return {
    ...state,
    ...patch,
  };
}
