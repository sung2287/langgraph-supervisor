import { LocalLLMClient } from "../llm/local.adapter";
import { OpenAIAdapter } from "../llm/openai.adapter";
import { RouterLLMClient } from "../llm/router.client";
import { PolicyInterpreter } from "../../src/policy/interpreter/policy.interpreter";
import { parseRunLocalArgs } from "./run_local.args";
import { runGraph } from "../graph/graph";

const { input, projectId, repoPath, phase, profile } = parseRunLocalArgs(
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
  const executionPlan = interpreter.resolveExecutionPlan({ userInput: input });
  const result = await runGraph(
    null,
    llm,
    input,
    projectId,
    repoPath,
    phase,
    executionPlan
  );
  const output = result.output;
  console.log("----- output -----");
  console.log(output);
  console.log("----- plan metadata -----");
  console.log(
    `policyId=${executionPlan.metadata.policyId} modeLabel=${executionPlan.metadata.modeLabel ?? "UNSPECIFIED"}`
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`run:local failed: ${message}`);
  process.exitCode = 1;
}
