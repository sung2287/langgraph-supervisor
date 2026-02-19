import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, GraphState, runGraph } from "../../../agent/graph/graph";
import { LLMClient } from "../../../agent/llm/llm.types";
import { MemoryRepository } from "../../../agent/memory/memory.repository";
import { MemoryCard, MemoryType, SearchFilters } from "../../../agent/memory/memory.types";

class ThrowLLM implements LLMClient {
  async generate(_prompt: string): Promise<string> {
    throw new Error("LLM_GENERATE_FAILED");
  }
}

class AbortThrowLLM implements LLMClient {
  async generate(_prompt: string): Promise<string> {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  }
}

class SpyMemoryRepository implements MemoryRepository {
  public saveCalls = 0;
  public updateCalls = 0;

  get persistCalls(): number {
    return this.saveCalls + this.updateCalls;
  }

  async save(_card: MemoryCard): Promise<void> {
    this.saveCalls += 1;
  }

  async update(_card: MemoryCard): Promise<void> {
    this.updateCalls += 1;
  }

  async search(_query: string, _filters?: SearchFilters): Promise<MemoryCard[]> {
    return [];
  }

  async getByType(_type: MemoryType): Promise<MemoryCard[]> {
    return [];
  }

  async getLatestState(_projectId: string): Promise<MemoryCard | null> {
    return null;
  }
}

function makeInitialState(
  userInput: string,
  projectId: string
): GraphState {
  return {
    userInput,
    projectId,
    phase: "IMPLEMENT",
    outputMode: "CHAT",
    outputs: {
      implement_analysis: "",
      chat: "",
      agent_prompt_md: "",
    },
    scanExecuted: false,
    repoPath: process.cwd(),
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
    },
    conflictDetected: false,
  };
}

test("runGraph: LLM error degrades to NEED_CONTEXT and blocks persistence", async () => {
  const repo = new SpyMemoryRepository();
  const llm = new ThrowLLM();

  const result = await runGraph(repo, llm, "trigger llm error", "project-llm-error");
  assert.equal(result, "CONFIRMATION REQUIRED");
  assert.equal(repo.persistCalls, 0);
  assert.equal(repo.saveCalls, 0);
  assert.equal(repo.updateCalls, 0);
});

test("buildGraph: AbortError degrades to NEED_CONTEXT with timeout issue and no persistence", async () => {
  const repo = new SpyMemoryRepository();
  const llm = new AbortThrowLLM();
  const app = buildGraph(repo, llm);

  const result = await app.invoke(
    makeInitialState("abort 에러 처리 검증", "project-llm-abort")
  );

  assert.equal(result.supervisorOutput.status, "NEED_CONTEXT");
  assert.equal(result.conflictDetected, true);
  assert.equal(result.supervisorOutput.facts_md.trim() !== "", true);
  assert.equal(result.supervisorOutput.analysis_md.includes("IMPLEMENT_ANALYSIS"), true);
  assert.equal(result.outputs.chat.trim() !== "", true);
  assert.equal(result.supervisorOutput.report_md.includes(result.supervisorOutput.facts_md), true);
  const timeoutIssue = (result.supervisorOutput.issues ?? []).find(
    (issue) => issue.title === "LLM_TIMEOUT"
  );
  assert.ok(timeoutIssue);
  assert.equal(repo.persistCalls, 0);
  assert.equal(repo.saveCalls, 0);
  assert.equal(repo.updateCalls, 0);
});
