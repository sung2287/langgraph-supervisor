import { coreStepExecutors } from "../../src/core/plan/plan.handlers";
import {
  createStepExecutorRegistry,
  type StepExecutorRegistry,
} from "../../src/core/plan/step.registry";

export interface RuntimeStepRegistryOptions {
  readonly repoRoot: string;
  readonly nowMs?: () => number;
}

export async function createRuntimeStepExecutorRegistry(
  options: RuntimeStepRegistryOptions
): Promise<StepExecutorRegistry> {
  const registry = createStepExecutorRegistry();

  for (const [kind, executor] of Object.entries(coreStepExecutors)) {
    registry.register(kind, executor);
  }

  try {
    const pluginModule = await import("../../src/plugin/repository/index");
    if (typeof pluginModule.registerRepositoryPluginExecutors === "function") {
      pluginModule.registerRepositoryPluginExecutors(registry, {
        repoRoot: options.repoRoot,
        nowMs: options.nowMs,
      });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`plugin registry optional load skipped: ${reason}`);
  }

  return registry;
}
