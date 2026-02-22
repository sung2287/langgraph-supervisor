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
import { FileSecretManager, resolveProviderHint } from "../secrets/secret.manager";
import type { PolicyRef } from "../../src/core/plan/plan.types";

const GLOBAL_HASH_DOMAIN = "global";
const DEFAULT_HASH_MODEL = "DEFAULT";

function resolveHashMode(policyRef: PolicyRef, fallbackMode: string): string {
  const modeLabel = (policyRef as { modeLabel?: unknown }).modeLabel;
  if (typeof modeLabel === "string" && modeLabel.trim() !== "") {
    return modeLabel;
  }
  return fallbackMode;
}

function resolveHashDomain(currentDomain: string | undefined): string {
  if (typeof currentDomain !== "string") {
    return GLOBAL_HASH_DOMAIN;
  }
  const trimmed = currentDomain.trim();
  return trimmed === "" ? GLOBAL_HASH_DOMAIN : trimmed;
}

function sanitizeSessionName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new Error("SESSION_NAMESPACE_INVALID session name must be non-empty");
  }
  return trimmed.replace(/[^A-Za-z0-9._-]/g, "_");
}

const {
  input,
  repoPath,
  phase,
  currentDomain,
  profile,
  secretProfile,
  freshSession,
  session,
  provider,
  model,
  timeoutMs,
  maxAttempts,
} = parseRunLocalArgs(process.argv.slice(2));

const sessionFilename =
  typeof session === "string" && session.trim() !== ""
    ? `session_state.${sanitizeSessionName(session)}.json`
    : "session_state.json";

try {
  const secretManager = new FileSecretManager();
  const loadedSecretProfile = await secretManager.loadProfile(secretProfile);
  const providerHint = resolveProviderHint(provider, process.env.LLM_PROVIDER);
  const injectionEnv = secretManager.getInjectionEnv(loadedSecretProfile, providerHint);
  const providerResolutionEnv = {
    ...process.env,
    ...injectionEnv,
  };

  const providerConfig = resolveProviderConfig(
    {
      provider,
      model,
      timeoutMs,
      maxAttempts,
    },
    providerResolutionEnv
  );
  const llm = createLLMClientFromProviderConfig(providerConfig, providerResolutionEnv);
  console.log(
    `mode=local repoPath=${repoPath} phase=${phase} profile=${profile} secretProfile=${secretProfile} provider=${providerConfig.provider} model=${providerConfig.model ?? "DEFAULT"}`
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
  const hashMetadata = {
    provider: providerConfig.provider,
    model: providerConfig.model ?? DEFAULT_HASH_MODEL,
    mode: resolveHashMode(policyRef, resolvedPlan.metadata.mode),
    domain: resolveHashDomain(currentDomain),
  } as const;
  // Breaking change (PRD-012A): legacy session_state hashes will mismatch; use --fresh-session.
  const expectedHash = computeExecutionPlanHash({
    executionPlan,
    policyRef,
    metadata: hashMetadata,
  });

  const sessionStore = new FileSessionStore(repoPath, {
    filename: sessionFilename,
  });
  if (freshSession) {
    sessionStore.prepareFreshSession();
  }
  const loadedSession = sessionStore.load();
  if (loadedSession !== null) {
    sessionStore.verify(expectedHash);
    console.log(`[session] loaded ${sessionFilename} (sessionId=${loadedSession.sessionId})`);
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
          currentDomain,
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
