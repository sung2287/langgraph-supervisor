import type { ExecutionStep, PlanExecutionContext } from "./plan.types";

export type StepHandler = (
  ctx: PlanExecutionContext,
  step: ExecutionStep
) => Promise<void> | void;

export class StepRegistry {
  private readonly handlers = new Map<string, StepHandler>();

  register(type: string, handler: StepHandler): this {
    this.handlers.set(type, handler);
    return this;
  }

  async executeStep(ctx: PlanExecutionContext, step: ExecutionStep): Promise<void> {
    const handler = this.handlers.get(step.type);
    if (!handler) {
      throw new Error(`PLAN_EXECUTION_ERROR unknown step type '${step.type}'`);
    }
    await handler(ctx, step);
  }
}
