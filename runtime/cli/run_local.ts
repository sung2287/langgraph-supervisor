import { LocalLLMClient } from "../llm/local.adapter";
import { OpenAIAdapter } from "../llm/openai.adapter";
import { RouterLLMClient } from "../llm/router.client";
import { randomUUID } from "node:crypto";
import { PolicyInterpreter } from "../../src/policy/interpreter/policy.interpreter";
import { computeExecutionPlanHash } from "../../src/session/execution_plan_hash";
import { FileSessionStore } from "../../src/session/file_session.store";
import { runSessionLifecycle } from "../../src/session/session.lifecycle";
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

const { input, repoPath, phase, profile } = parseRunLocalArgs(
  process.argv.slice(2)
);
const llm = new RouterLLMClient(
  {
    mode: "local",
    promptLengthThreshold: 2000,
  },
  new LocalLLMClient(),
  new OpenAIAdapter()
);

console.log(`mode=local repoPath=${repoPath} phase=${phase} profile=${profile}`);

try {
  const interpreter = new PolicyInterpreter({
    repoRoot: repoPath,
    profile,
  });
  const resolvedPlan = interpreter.resolveExecutionPlan({
    userInput: input,
    requestedPhase: phase,
  });
  const modeLabel = resolvedPlan.metadata.modeLabel;
  const bundles = modeLabel ? interpreter.getBundlesForMode(modeLabel) : [];
  const docBundleRefs = bundles.flatMap((bundle) => bundle.files);
  const executionPlan = toCoreExecutionPlan(resolvedPlan);
  const policyRef = toPolicyRef(resolvedPlan, docBundleRefs);
  const expectedHash = computeExecutionPlanHash({
    executionPlan,
    policyRef,
  });

  const sessionStore = new FileSessionStore(repoPath);
  const memoryRepo = new InMemoryRepository();
  const storageLayer = createSQLiteStorageLayer();
  storageLayer.storage.connect();
  const stepExecutorRegistry = await createRuntimeStepExecutorRegistry({
    repoRoot: repoPath,
  });

  const { result } = await (async () => {
    try {
      return await runSessionLifecycle({
        store: sessionStore,
        expectedHash,
        run: async (loadedSession) => {
          const graphResult = await runGraph(
            {
              userInput: input,
              executionPlan,
              policyRef,
              currentMode: resolvedPlan.metadata.modeLabel,
            },
            {
              planExecutorDeps: createRuntimePlanExecutorDeps({
                llmClient: llm,
                memoryRepo,
                storageLayer,
              }),
              stepExecutorRegistry,
            }
          );

          return {
            success: true,
            result: graphResult,
            nextSession: {
              sessionId: loadedSession?.sessionId ?? randomUUID(),
              memoryRef: loadedSession?.memoryRef ?? "runtime:memory:in-memory",
              repoScanVersion:
                graphResult.repoScanVersion ?? loadedSession?.repoScanVersion ?? "none",
              lastExecutionPlanHash: expectedHash,
              updatedAt: loadedSession?.updatedAt ?? "",
            },
          };
        },
      });
    } finally {
      storageLayer.storage.close();
    }
  })();

  const output = result.lastResponse ?? "";
  console.log("----- output -----");
  console.log(output);
  console.log("----- plan metadata -----");
  console.log(
    `policyId=${resolvedPlan.metadata.policyId} modeLabel=${resolvedPlan.metadata.modeLabel ?? "UNSPECIFIED"}`
  );
} catch (error) {
  if (error instanceof CycleFailError) {
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
