import type { GraphState, PlanExecutorDeps, Step } from "./plan.types";

export type StatePatch = Partial<
  Omit<GraphState, "userInput" | "executionPlan" | "policyRef">
>;

export type StepExecutionResult =
  | {
      kind: "ok";
      patch?: StatePatch;
      data?: unknown;
    }
  | {
      kind: "unavailable";
      reason: string;
      patch?: StatePatch;
    }
  | {
      kind: "error";
      error: {
        message: string;
        name?: string;
      };
      patch?: StatePatch;
    };

export type StepExecutor = (
  state: Readonly<GraphState>,
  step: Step,
  deps: PlanExecutorDeps
) => Promise<StepExecutionResult> | StepExecutionResult;

export interface StepExecutorRegistry {
  register(kind: string, executor: StepExecutor): this;
  execute(
    kind: string,
    step: Step,
    state: Readonly<GraphState>,
    deps: PlanExecutorDeps
  ): Promise<StepExecutionResult>;
}

class DefaultStepExecutorRegistry implements StepExecutorRegistry {
  private readonly executors = new Map<string, StepExecutor>();

  register(kind: string, executor: StepExecutor): this {
    this.executors.set(kind, executor);
    return this;
  }

  async execute(
    kind: string,
    step: Step,
    state: Readonly<GraphState>,
    deps: PlanExecutorDeps
  ): Promise<StepExecutionResult> {
    const executor = this.executors.get(kind);
    if (!executor) {
      return {
        kind: "unavailable",
        reason: `STEP_EXECUTOR_UNAVAILABLE:${kind}`,
      };
    }

    try {
      return await executor(state, step, deps);
    } catch (error) {
      return {
        kind: "error",
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : { message: String(error) },
      };
    }
  }
}

export function createStepExecutorRegistry(): StepExecutorRegistry {
  return new DefaultStepExecutorRegistry();
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
