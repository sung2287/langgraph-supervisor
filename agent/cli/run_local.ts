import { buildGraph, GraphState, SupervisorPhase } from "../graph/graph";
import { LocalLLMClient } from "../llm/local.adapter";
import { OpenAIAdapter } from "../llm/openai.adapter";
import { RouterLLMClient } from "../llm/router.client";
import { SqliteMemoryRepository } from "../memory/sqlite.repository";

function parseArgs(argv: string[]): {
  input: string;
  projectId: string;
  repoPath: string;
  phase: SupervisorPhase;
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
  const projectId = positional[1] ?? "default";
  const repoPath = repoPathFromFlag ?? positional[2] ?? process.cwd();
  const rawPhase = phaseFromFlag ?? positional[3] ?? "CHAT";
  const phase: SupervisorPhase =
    rawPhase === "PRD_DRAFT" ||
    rawPhase === "IMPLEMENT" ||
    rawPhase === "DIAGNOSE" ||
    rawPhase === "CHAT"
      ? rawPhase
      : "CHAT";

  return { input, projectId, repoPath, phase };
}

const { input, projectId, repoPath, phase } = parseArgs(process.argv.slice(2));

const repo = new SqliteMemoryRepository(projectId);
const llm = new RouterLLMClient(
  {
    mode: "local",
    promptLengthThreshold: 2000,
  },
  new LocalLLMClient(),
  new OpenAIAdapter()
);

const app = buildGraph(repo, llm, {
  onBeforeAct: (state) => {
    if (!state.scanExecuted) {
      return;
    }
    console.log("----- repo_scan_summary -----");
    console.log("changed_files:");
    console.log(state.repoContextBundle?.changed_files ?? "UNAVAILABLE");
    console.log("diff_stat:");
    console.log(state.repoContextBundle?.diff_stat ?? "UNAVAILABLE");
    console.log("diff_length:");
    console.log(
      typeof state.repoContextBundle?.diff === "string"
        ? state.repoContextBundle.diff.length
        : "UNAVAILABLE"
    );
    console.log("file_snippets_count:");
    console.log(
      Array.isArray(state.repoContextBundle?.file_snippets)
        ? state.repoContextBundle.file_snippets.length
        : 0
    );
  },
});
const initialState: GraphState = {
  userInput: input,
  projectId,
  phase,
  outputMode: "CHAT",
  outputs: {
    implement_analysis: "",
    chat: "",
    agent_prompt_md: "",
  },
  scanExecuted: false,
  repoPath,
  repoContextBundle: {
    changed_files: "UNAVAILABLE",
    diff_name_only: "UNAVAILABLE",
    diff_stat: "UNAVAILABLE",
    diff: "UNAVAILABLE",
    file_snippets: "UNAVAILABLE",
    test_log: "UNAVAILABLE",
    scan_errors: [],
  },
  prdId: "",
  prdFilePath: "",
  prdSummary: "",
  partialPrd: false,
  preflightNeedContext: false,
  preflightIssues: [],
  preflightRequiredContext: [],
  retryCount: 0,
  retryPrompt: "",
  validateError: "",
  diffCapMetrics: "lines=0 chars=0 sections=0 capped=false",
  retrieved: [],
  assembledPrompt: "",
  actOutput: "",
  supervisorOutput: {
    status: "NEED_CONTEXT",
    facts_md: "",
    analysis_md: "",
    report_md: "",
    issues: [],
    required_context: [],
  },
  conflictDetected: false,
};

const result = await app.invoke(initialState);
const status = result.supervisorOutput.status;
const implementAnalysisOutput =
  result.phase === "CHAT" ? "(none)" : result.outputs.implement_analysis;
const finalOutput =
  `IMPLEMENT_ANALYSIS:\n${implementAnalysisOutput}\n\nCHAT:\n${result.outputs.chat}`;

console.log(
  `status=${status} conflictDetected=${result.conflictDetected} repoPath=${repoPath} phase=${result.phase}`
);
console.log("----- IMPLEMENT_ANALYSIS -----");
console.log(implementAnalysisOutput);
console.log("----- CHAT -----");
console.log(result.outputs.chat);
console.log("----- final -----");
console.log(finalOutput);
