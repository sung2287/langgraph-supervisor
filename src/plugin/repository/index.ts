import type { StepExecutorRegistry } from "../../core/plan/step.registry";
import {
  createRepoContextExecutor,
  type RepoContextExecutorOptions,
} from "./repo_context.executor";

export {
  createRepoContextExecutor,
  type RepoContextExecutorOptions,
} from "./repo_context.executor";

export { scanRepository, type FileIndexEntry, type ScanResult } from "./scanner";
export {
  SCAN_RESULT_REL_PATH,
  isFresh,
  readScanResult,
  resolveScanResultPath,
  writeScanResult,
} from "./snapshot_manager";

export function registerRepositoryPluginExecutors(
  registry: StepExecutorRegistry,
  options: RepoContextExecutorOptions
): StepExecutorRegistry {
  const executor = createRepoContextExecutor(options);
  registry.register("RepoScan", executor);
  registry.register("repo_context", executor);
  return registry;
}

export const registerRepositoryPlugin = registerRepositoryPluginExecutors;
