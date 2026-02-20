import { LocalLLMClient } from "../llm/local.adapter";
import { OpenAIAdapter } from "../llm/openai.adapter";
import { RouterLLMClient } from "../llm/router.client";

function parseArgs(argv: string[]): {
  input: string;
  repoPath: string;
  phase: "PRD_DRAFT" | "IMPLEMENT" | "DIAGNOSE" | "CHAT";
} {
  const positional: string[] = [];
  let repoPathFromFlag: string | undefined;
  let phaseFromFlag: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      continue;
    }
    if (token === "--repo") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        repoPathFromFlag = next;
        i += 1;
        continue;
      }
    }
    if (token === "--phase") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        phaseFromFlag = next.trim().toUpperCase();
        i += 1;
        continue;
      }
    }
    positional.push(token);
  }

  const input = positional[0] ?? "Hello from local CLI";
  const repoPath = repoPathFromFlag ?? process.cwd();
  const rawPhase = phaseFromFlag ?? "CHAT";
  const phase: "PRD_DRAFT" | "IMPLEMENT" | "DIAGNOSE" | "CHAT" =
    rawPhase === "PRD_DRAFT" ||
    rawPhase === "IMPLEMENT" ||
    rawPhase === "DIAGNOSE" ||
    rawPhase === "CHAT"
      ? rawPhase
      : "CHAT";

  return { input, repoPath, phase };
}

const { input, repoPath, phase } = parseArgs(process.argv.slice(2));
const llm = new RouterLLMClient(
  {
    mode: "local",
    promptLengthThreshold: 2000,
  },
  new LocalLLMClient(),
  new OpenAIAdapter()
);

console.log(`mode=local repoPath=${repoPath} phase=${phase}`);

try {
  const output = await llm.generate(input);
  console.log("----- output -----");
  console.log(output);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`run:local failed: ${message}`);
  process.exitCode = 1;
}
