import { PolicyInterpreter } from "../../src/policy/interpreter/policy.interpreter";
import { computeExecutionPlanHash } from "../../src/session/execution_plan_hash";
import { FileSessionStore } from "../../src/session/file_session.store";
import { createSQLiteStorageLayer } from "../../src/adapter/storage/sqlite";
import { runGraph, toCoreExecutionPlan, toPolicyRef } from "../graph/graph";
import { createRuntimeStepExecutorRegistry } from "../graph/step_executor_registry";
import { createRuntimePlanExecutorDeps } from "../graph/plan_executor_deps";
import { createLLMClientFromProviderConfig } from "../llm/provider.client";
import { resolveProviderConfig } from "../llm/provider.router";
import { InMemoryRepository } from "../memory/in_memory.repository";
import { FileSecretManager } from "../secrets/secret.manager";
import { buildSessionFilename } from "./session_namespace";

const GLOBAL_HASH_DOMAIN = "global";
const DEFAULT_HASH_MODEL = "DEFAULT";

export interface RuntimeRunRequest {
  readonly inputText: string;
  readonly repoPath: string;
  readonly phase: string;
  readonly currentDomain?: string;
  readonly profile: string;
  readonly secretProfile: string;
  readonly freshSession: boolean;
  readonly sessionName?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly onStatus?: (currentStepLabel: string) => void;
}

export interface RuntimeRunResult {
  readonly output: string;
  readonly policyId: string;
  readonly modeLabel: string;
  readonly provider: string;
  readonly model: string;
  readonly domain: string;
  readonly secretProfileLabel: string;
  readonly sessionFilename: string;
  readonly loadedSessionId?: string;
  readonly currentStepLabel: string;
  readonly history: ReadonlyArray<{ role: string; content: string }>;
}

function resolveHashMode(
  policyRef: Readonly<Record<string, unknown>>,
  fallbackMode: string
): string {
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

export function isSessionHashMismatchError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("SESSION_STATE_HASH_MISMATCH");
}

export async function runRuntimeOnce(input: RuntimeRunRequest): Promise<RuntimeRunResult> {
  input.onStatus?.("Preparing Runtime");

  const sessionFilename = buildSessionFilename(input.sessionName);
  const secretManager = new FileSecretManager();
  const loadedSecretProfile = await secretManager.loadProfile(input.secretProfile);
  const preValidationEnv = secretManager.getInjectionEnv(loadedSecretProfile);
  const providerResolutionEnv = {
    ...process.env,
    ...preValidationEnv,
  };

  const providerConfig = resolveProviderConfig(
    {
      provider: input.provider,
      model: input.model,
      timeoutMs: input.timeoutMs,
      maxAttempts: input.maxAttempts,
    },
    providerResolutionEnv
  );
  const injectionEnv = secretManager.getInjectionEnv(loadedSecretProfile, providerConfig.provider);
  const providerRuntimeEnv = {
    ...process.env,
    ...injectionEnv,
  };
  const llm = createLLMClientFromProviderConfig(providerConfig, providerRuntimeEnv);

  input.onStatus?.("Resolving Policy");
  const interpreter = new PolicyInterpreter({
    repoRoot: input.repoPath,
    profile: input.profile,
  });
  const resolvedPlan = interpreter.resolveExecutionPlan({
    userInput: input.inputText,
    requestedPhase: input.phase,
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
    domain: resolveHashDomain(input.currentDomain),
  } as const;
  // Breaking change (PRD-012A): legacy session_state hashes will mismatch; use --fresh-session.
  const expectedHash = computeExecutionPlanHash({
    executionPlan,
    policyRef,
    metadata: hashMetadata,
  });

  const sessionStore = new FileSessionStore(input.repoPath, {
    filename: sessionFilename,
  });
  if (input.freshSession) {
    sessionStore.prepareFreshSession();
  }
  const loadedSession = sessionStore.load();
  if (loadedSession !== null) {
    sessionStore.verify(expectedHash);
  }

  const memoryRepo = new InMemoryRepository();
  const storageLayer = createSQLiteStorageLayer();
  storageLayer.storage.connect();
  const stepExecutorRegistry = await createRuntimeStepExecutorRegistry({
    repoRoot: input.repoPath,
  });

  input.onStatus?.("Executing Plan");
  try {
    const result = await runGraph(
      {
        userInput: input.inputText,
        executionPlan,
        policyRef,
        projectId: input.repoPath,
        currentMode: resolvedPlan.metadata.mode,
        currentDomain: input.currentDomain,
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

    input.onStatus?.("Completed");
    const output = result.lastResponse ?? "";
    const model = providerConfig.model ?? DEFAULT_HASH_MODEL;
    return {
      output,
      policyId: resolvedPlan.metadata.policyProfile,
      modeLabel: resolvedPlan.metadata.mode ?? "UNSPECIFIED",
      provider: providerConfig.provider,
      model,
      domain: resolveHashDomain(input.currentDomain),
      secretProfileLabel: input.secretProfile,
      sessionFilename,
      loadedSessionId: loadedSession?.sessionId,
      currentStepLabel: "Completed",
      history: [
        { role: "user", content: input.inputText },
        { role: "assistant", content: output },
      ],
    };
  } finally {
    storageLayer.storage.close();
  }
}
