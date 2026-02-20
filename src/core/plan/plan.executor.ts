import type { ExecutionPlan, PlanExecutionContext } from "./plan.types";
import { StepRegistry } from "./step.registry";

export function createDefaultStepRegistry(): StepRegistry {
  return new StepRegistry()
    .register("recall", (ctx) => {
      ctx.stepLog.push("recall");
    })
    .register("repo_scan", (ctx) => {
      ctx.stepLog.push("repo_scan");
    })
    .register("assemble_prompt", (ctx, step) => {
      const prefix = typeof step.params.prefix === "string" ? step.params.prefix : "";
      ctx.assembledPrompt = `${prefix}${ctx.userInput}`;
      ctx.stepLog.push("assemble_prompt");
    })
    .register("llm_call", async (ctx) => {
      const prompt = ctx.assembledPrompt || ctx.userInput;
      ctx.output = await ctx.llmGenerate(prompt);
      ctx.stepLog.push("llm_call");
    })
    .register("memory_write", (ctx) => {
      ctx.stepLog.push("memory_write");
    });
}

export async function executeExecutionPlan(
  plan: ExecutionPlan,
  ctx: PlanExecutionContext,
  registry: StepRegistry = createDefaultStepRegistry()
): Promise<PlanExecutionContext> {
  for (const step of plan.steps) {
    await registry.executeStep(ctx, step);
  }
  return ctx;
}
