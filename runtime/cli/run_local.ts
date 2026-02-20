import { LocalLLMClient } from "../llm/local.adapter";
import { OpenAIAdapter } from "../llm/openai.adapter";
import { RouterLLMClient } from "../llm/router.client";
import { PolicyInterpreter } from "../../src/policy/interpreter/policy.interpreter";
import { parseRunLocalArgs } from "./run_local.args";
import {
  runGraph,
  toCoreExecutionPlan,
  toPolicyRef,
} from "../graph/graph";
import { InMemoryRepository } from "../memory/in_memory.repository";

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
    repoRoot: process.cwd(),
    profile,
  });
  const resolvedPlan = interpreter.resolveExecutionPlan({ userInput: input });
  const modeLabel = resolvedPlan.metadata.modeLabel;
  const bundles = modeLabel ? interpreter.getBundlesForMode(modeLabel) : [];
  const docBundleRefs = bundles.flatMap((bundle) => bundle.files);
  const memoryRepo = new InMemoryRepository();
  const result = await runGraph(
    {
      userInput: input,
      executionPlan: toCoreExecutionPlan(resolvedPlan),
      policyRef: toPolicyRef(resolvedPlan, docBundleRefs),
      currentMode: resolvedPlan.metadata.modeLabel,
    },
    {
      llmClient: llm,
      memoryRepo,
    }
  );
  const output = result.lastResponse ?? "";
  console.log("----- output -----");
  console.log(output);
  console.log("----- plan metadata -----");
  console.log(
    `policyId=${resolvedPlan.metadata.policyId} modeLabel=${resolvedPlan.metadata.modeLabel ?? "UNSPECIFIED"}`
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`run:local failed: ${message}`);
  process.exitCode = 1;
}
