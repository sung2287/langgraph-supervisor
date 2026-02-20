import type { StepExecutorRegistry } from "../../core/plan/step.registry";
import {
  createRepoContextExecutor,
  type RepoContextExecutorOptions,
} from "./repo_context.executor";

export function registerRepositoryPluginExecutors(
  registry: StepExecutorRegistry,
  options: RepoContextExecutorOptions
): StepExecutorRegistry {
  registry.register("repo_context", createRepoContextExecutor(options));
  return registry;
}
