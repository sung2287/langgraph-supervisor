import { PolicyInterpreter } from "../../src/policy/interpreter/policy.interpreter";
import { computeExecutionPlanHash } from "../../src/session/execution_plan_hash";
import { FileSessionStore } from "../../src/session/file_session.store";
import { parseRunLocalArgs } from "./run_local.args";
import {
  runGraph,
  toCoreExecutionPlan,
  toPolicyRef,
} from "../graph/graph";
import { createRuntimeStepExecutorRegistry } from "../graph/step_executor_registry";
import { createRuntimePlanExecutorDeps } from "../graph/plan_executor_deps";
import { InMemoryRepository } from "../memory/in_memory.repository";
import { CycleFailError, FailFastError } from "../../src/core/plan/errors";
import { createSQLiteStorageLayer } from "../../src/adapter/storage/sqlite";
import { resolveProviderConfig } from "../llm/provider.router";
import { createLLMClientFromProviderConfig } from "../llm/provider.client";
import { ConfigurationError as LlmConfigurationError } from "../llm/errors";
import { ConfigurationError as PolicyConfigurationError } from "../../src/policy/interpreter/policy.errors";

const { input, repoPath, phase, profile, provider, model, timeoutMs, maxAttempts } = parseRunLocalArgs(
  process.argv.slice(2)
);

try {
  const providerConfig = resolveProviderConfig(
    {
      provider,
      model,
      timeoutMs,
      maxAttempts,
    },
    process.env
  );
  const llm = createLLMClientFromProviderConfig(providerConfig, process.env);
  console.log(
    `mode=local repoPath=${repoPath} phase=${phase} profile=${profile} provider=${providerConfig.provider} model=${providerConfig.model ?? "DEFAULT"}`
  );

  const interpreter = new PolicyInterpreter({
    repoRoot: repoPath,
    profile,
  });
  const resolvedPlan = interpreter.resolveExecutionPlan({
    userInput: input,
    requestedPhase: phase,
  });
  const modeLabel = resolvedPlan.metadata.mode;
  const bundles = modeLabel ? interpreter.getBundlesForMode(modeLabel) : [];
  const docBundleRefs = bundles.flatMap((bundle) => bundle.files);
  const executionPlan = toCoreExecutionPlan(resolvedPlan);
  const policyRef = toPolicyRef(resolvedPlan, docBundleRefs);
  const expectedHash = computeExecutionPlanHash({
    executionPlan,
    policyRef,
  });

  const sessionStore = new FileSessionStore(repoPath);
  const loadedSession = sessionStore.load();
  if (loadedSession !== null) {
    sessionStore.verify(expectedHash);
    console.log(`[session] loaded session_state.json (sessionId=${loadedSession.sessionId})`);
  }
  const memoryRepo = new InMemoryRepository();
  const storageLayer = createSQLiteStorageLayer();
  storageLayer.storage.connect();
  const stepExecutorRegistry = await createRuntimeStepExecutorRegistry({
    repoRoot: repoPath,
  });

  const result = await (async () => {
    try {
      return await runGraph(
        {
          userInput: input,
          executionPlan,
          policyRef,
          projectId: repoPath,
          currentMode: resolvedPlan.metadata.mode,
        },
        {
          planExecutorDeps: createRuntimePlanExecutorDeps({
            llmClient: llm,
            memoryRepo,
            storageLayer,
            sessionStore,
            expectedHash,
            loadedSession,
          }),
          stepExecutorRegistry,
        }
      );
    } finally {
      storageLayer.storage.close();
    }
  })();

  const output = result.lastResponse ?? "";
  console.log("----- output -----");
  console.log(output);
  console.log("----- plan metadata -----");
  console.log(
    `policyId=${resolvedPlan.metadata.policyProfile} modeLabel=${resolvedPlan.metadata.mode ?? "UNSPECIFIED"}`
  );
} catch (error) {
  if (error instanceof LlmConfigurationError || error instanceof PolicyConfigurationError) {
    console.error(`run:local configuration error: ${error.message}`);
    process.exitCode = 1;
  } else if (error instanceof CycleFailError) {
    console.error(`run:local cycle failed: ${error.message}`);
    process.exitCode = 1;
  } else if (error instanceof FailFastError) {
    console.error(`run:local fail-fast: ${error.message}`);
    process.exitCode = 1;
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`run:local failed: ${message}`);
    process.exitCode = 1;
  }
}
