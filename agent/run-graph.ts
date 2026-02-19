import { runGraph, SupervisorPhase } from "./graph/graph";
import { LocalLLMClient } from "./llm/local.adapter";
import { OpenAIAdapter } from "./llm/openai.adapter";
import { RouterLLMClient } from "./llm/router.client";
import { MemoryRepository } from "./memory/memory.repository";

export async function runGraphWithRouter(
  repo: MemoryRepository,
  input: string,
  projectId: string,
  repoPath: string = process.cwd(),
  phase: SupervisorPhase = "CHAT"
): Promise<string> {
  const llm = new RouterLLMClient(
    {
      mode: "local",
      promptLengthThreshold: 2000,
    },
    new LocalLLMClient(),
    new OpenAIAdapter()
  );

  return runGraph(repo, llm, input, projectId, repoPath, phase);
}
