/**
 * Intent: Phase/PRD/output 검증 회귀 테스트
 * - PRD ID 추출/추론
 * - diff cap 상한
 * - validate -> retry -> fallback
 * - IMPLEMENT 기본(CHAT mode)에서 agent_prompt 비생성
 */

import test from "node:test";
import assert from "node:assert/strict";
import { __graphTestHooks, buildGraph, GraphState } from "../../../agent/graph/graph";
import { LLMClient } from "../../../agent/llm/llm.types";
import { MemoryRepository } from "../../../agent/memory/memory.repository";
import { MemoryCard, MemoryType, SearchFilters } from "../../../agent/memory/memory.types";

class FixedResponseLLM implements LLMClient {
  constructor(private readonly payload: string) {}

  async generate(_prompt: string): Promise<string> {
    return this.payload;
  }
}

class SequenceResponseLLM implements LLMClient {
  public calls = 0;

  constructor(private readonly payloads: string[]) {}

  async generate(_prompt: string): Promise<string> {
    const index = Math.min(this.calls, this.payloads.length - 1);
    this.calls += 1;
    return this.payloads[index] ?? "";
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
  projectId: string,
  repoPath: string = process.cwd(),
  phase: GraphState["phase"] = "IMPLEMENT"
): GraphState {
  return {
    userInput,
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
}

function installStandardRepoMock(t: test.TestContext, repoPath: string): void {
  const originalRunner = __graphTestHooks.runCommand;
  const originalReader = __graphTestHooks.readFile;

  __graphTestHooks.runCommand = (command: string, cwd: string) => {
    assert.equal(cwd, repoPath);
    if (command === "git status --porcelain") {
      return "M docs/prd/PRD-010_impl_plan.md\nM src/main.ts\n";
    }
    if (command === "git diff --name-only") {
      return "docs/prd/PRD-010_impl_plan.md\nsrc/main.ts\n";
    }
    if (command === "git diff --stat") {
      return " docs/prd/PRD-010_impl_plan.md | 10 +++---\n src/main.ts | 4 ++--\n";
    }
    if (command === "git diff") {
      return [
        "diff --git a/docs/prd/PRD-010_impl_plan.md b/docs/prd/PRD-010_impl_plan.md",
        "+Objective: implement feature",
        "+Requirements: deterministic behavior",
        "diff --git a/src/main.ts b/src/main.ts",
        "+console.log('ok')",
      ].join("\n");
    }
    if (command === "git ls-files docs/prd") {
      return "docs/prd/PRD-010_impl_plan.md\n";
    }
    throw new Error(`Unexpected command: ${command}`);
  };

  __graphTestHooks.readFile = (filePath: string) => {
    if (filePath.endsWith("docs/prd/PRD-010_impl_plan.md")) {
      return [
        "# PRD-010",
        "## Objective",
        "- 구현 지시문 생성",
        "## Scope",
        "- supervisor graph",
        "## Non-goals",
        "- external integration",
        "## Requirements",
        "- MUST deterministic",
        "## Constraints",
        "- READ-ONLY external repo",
        "## Acceptance",
        "- tests pass",
      ].join("\n");
    }
    return "export const ok = true;\n";
  };

  t.after(() => {
    __graphTestHooks.runCommand = originalRunner;
    __graphTestHooks.readFile = originalReader;
  });
}

test("prd id extraction and inference works deterministically", () => {
  assert.equal(__graphTestHooks.extractPrdIdFromUserInput("PRD-10 구현하자"), "010");
  assert.equal(__graphTestHooks.extractPrdIdFromUserInput("PRD-010 구현하자"), "010");
  assert.equal(
    __graphTestHooks.inferPrdIdFromBundle({
      changed_files: "M docs/prd/PRD-042_router_upgrade.md",
      diff_name_only: "docs/prd/PRD-042_router_upgrade.md",
      diff_stat: "(none)",
      diff: "(none)",
      file_snippets: "(none)",
      test_log: "UNAVAILABLE",
      scan_errors: [],
    }),
    "042"
  );
});

test("diff cap enforces deterministic upper bounds", () => {
  const largeDiff = new Array(5000).fill("+line").join("\n");
  const capped = __graphTestHooks.capDiffForPrompt(largeDiff);
  assert.equal(capped.value.length <= 12000, true);
  assert.equal(capped.value.split("\n").length <= 3001, true);
});

test("scan failure yields NEED_CONTEXT and blocks persistence", { concurrency: false }, async (t) => {
  const repo = new SpyMemoryRepository();
  const llm = new FixedResponseLLM(
    "IMPLEMENT_ANALYSIS:\n- 스캔 실패. EVIDENCE: scan_errors\nCHAT:\n스캔 실패 상태입니다.\nNEXT_ACTION: git status"
  );
  const app = buildGraph(repo, llm);

  const originalRunner = __graphTestHooks.runCommand;
  __graphTestHooks.runCommand = () => {
    throw new Error("git command failed");
  };
  t.after(() => {
    __graphTestHooks.runCommand = originalRunner;
  });

  const result = await app.invoke(
    makeInitialState("PRD-010 구현", "project-scan-fail", "/tmp/failure-repo")
  );

  assert.equal(result.supervisorOutput.status, "NEED_CONTEXT");
  assert.equal(result.conflictDetected, true);
  assert.equal(repo.persistCalls, 0);
});

test("missing PRD id/file degrades to NEED_CONTEXT without abort", { concurrency: false }, async (t) => {
  const repo = new SpyMemoryRepository();
  const llm = new FixedResponseLLM(
    "IMPLEMENT_ANALYSIS:\n- 기본 분석입니다. EVIDENCE: scan_errors\nCHAT:\n컨텍스트를 확인합니다.\nNEXT_ACTION: git status"
  );
  const app = buildGraph(repo, llm);
  const originalRunner = __graphTestHooks.runCommand;
  const originalReader = __graphTestHooks.readFile;

  __graphTestHooks.runCommand = (command: string) => {
    if (command === "git status --porcelain") return "M src/main.ts\n";
    if (command === "git diff --name-only") return "src/main.ts\n";
    if (command === "git diff --stat") return " src/main.ts | 1 +\n";
    if (command === "git diff") return "diff --git a/src/main.ts b/src/main.ts\n+x\n";
    if (command === "git ls-files docs/prd") return "(none)";
    throw new Error(`Unexpected command: ${command}`);
  };
  __graphTestHooks.readFile = () => "x";

  t.after(() => {
    __graphTestHooks.runCommand = originalRunner;
    __graphTestHooks.readFile = originalReader;
  });

  const result = await app.invoke(
    makeInitialState("구현 진행", "project-prd-missing", "/tmp/prd-missing", "IMPLEMENT")
  );

  assert.equal(result.supervisorOutput.status, "NEED_CONTEXT");
  assert.equal(result.conflictDetected, true);
  const prdIssue = (result.supervisorOutput.issues ?? []).find(
    (issue) => issue.title === "PRD_NOT_FOUND"
  );
  assert.ok(prdIssue);
  assert.equal(repo.persistCalls, 0);
});

test("IMPLEMENT + CHAT mode uses PRD summary and persists once with empty agent_prompt", { concurrency: false }, async (t) => {
  const repo = new SpyMemoryRepository();
  let capturedPrompt = "";
  const llm: LLMClient = {
    async generate(prompt: string): Promise<string> {
      capturedPrompt = prompt;
      return [
        "IMPLEMENT_ANALYSIS:",
        "- PRD 요구사항을 구현 체크리스트로 정규화합니다. EVIDENCE: prd_summary",
        "- 변경 파일 기준 적용 순서를 제시합니다. EVIDENCE: diff_name_only",
        "- 리스크를 단계별로 검증합니다. EVIDENCE: diff_stat",
        "CHAT:",
        "PRD 기준 구현 순서를 제안합니다.",
        "NEXT_ACTION: npm test",
      ].join("\n");
    },
  };
  const app = buildGraph(repo, llm);
  installStandardRepoMock(t, "/tmp/review-ok-repo");

  const result = await app.invoke(
    makeInitialState("PRD-10 구현하자", "project-review-ok", "/tmp/review-ok-repo", "IMPLEMENT")
  );

  assert.equal(result.supervisorOutput.status, "REVIEW_OK");
  assert.equal(result.conflictDetected, false);
  assert.equal(result.outputs.agent_prompt_md, "");
  assert.equal(result.outputs.chat.includes("NEXT_ACTION: npm test"), true);
  assert.equal(capturedPrompt.includes("## PRD SUMMARY"), true);
  assert.equal(capturedPrompt.includes("prd_id: 010"), true);
  assert.equal(repo.persistCalls, 1);
});

test("PRD 구현 의도는 CHAT 기본 진입에서도 IMPLEMENT phase + CHAT outputMode 유지", { concurrency: false }, async (t) => {
  const repo = new SpyMemoryRepository();
  const llm = new FixedResponseLLM(
    [
      "IMPLEMENT_ANALYSIS:",
      "- PRD 요구사항 기준 구현을 진행합니다. EVIDENCE: prd_summary",
      "- 변경 파일 우선순위를 반영합니다. EVIDENCE: diff_name_only",
      "- 검증 순서를 명시합니다. EVIDENCE: diff_stat",
      "CHAT:",
      "구현 준비가 되었습니다.",
      "NEXT_ACTION: npm test",
    ].join("\n")
  );
  const app = buildGraph(repo, llm);
  installStandardRepoMock(t, "/tmp/intent-upgrade-repo");

  const result = await app.invoke(
    makeInitialState("PRD-10 구현하자", "project-intent-upgrade", "/tmp/intent-upgrade-repo", "CHAT")
  );

  assert.equal(result.phase, "IMPLEMENT");
  assert.equal(result.outputMode, "CHAT");
  assert.equal(result.outputs.agent_prompt_md, "");
});

test("IMPLEMENT with compile trigger auto-switches outputMode and fills agent_prompt", { concurrency: false }, async (t) => {
  const repo = new SpyMemoryRepository();
  const llm = new FixedResponseLLM(
    [
      "IMPLEMENT_ANALYSIS:",
      "- PRD 기반 구현 단계를 정리합니다. EVIDENCE: prd_summary",
      "- 변경 파일 후보를 반영합니다. EVIDENCE: diff_name_only",
      "- 검증 순서를 확정합니다. EVIDENCE: diff_stat",
      "CHAT:",
      "Codex 지시문 생성을 준비했습니다.",
      "NEXT_ACTION: npm test",
    ].join("\n")
  );
  const app = buildGraph(repo, llm);
  installStandardRepoMock(t, "/tmp/compile-repo");

  const result = await app.invoke(
    makeInitialState(
      "코덱스 지시문 뽑아. PRD-10 구현하자",
      "project-compile-mode",
      "/tmp/compile-repo",
      "IMPLEMENT"
    )
  );

  assert.equal(result.outputMode, "COMPILE");
  assert.equal(result.supervisorOutput.status, "REVIEW_OK");
  assert.equal(result.outputs.agent_prompt_md.includes("Codex/Gemini Implementation Instruction"), true);
});

test("validate fail -> retry fail -> deterministic fallback", { concurrency: false }, async (t) => {
  const repo = new SpyMemoryRepository();
  const llm = new SequenceResponseLLM([
    "IMPLEMENT_ANALYSIS:\n- only english\nCHAT:\nhello\nNEXT_ACTION:",
    "IMPLEMENT_ANALYSIS:\n- still english only\nCHAT:\nhi\nNEXT_ACTION:",
  ]);
  const app = buildGraph(repo, llm);
  installStandardRepoMock(t, "/tmp/retry-fallback-repo");

  const result = await app.invoke(
    makeInitialState(
      "PRD-10 구현하자",
      "project-retry-fallback",
      "/tmp/retry-fallback-repo",
      "IMPLEMENT"
    )
  );

  assert.equal(llm.calls, 2);
  assert.equal(result.supervisorOutput.status, "REVIEW_OK");
  assert.equal(result.outputs.chat.includes("NEXT_ACTION:"), true);
  const nextActionLine = result.outputs.chat
    .split("\n")
    .find((line) => line.startsWith("NEXT_ACTION:"));
  assert.ok(nextActionLine);
  assert.equal((nextActionLine ?? "").trim().length > "NEXT_ACTION:".length, true);
});

test("validate fail -> retry success uses retry output", { concurrency: false }, async (t) => {
  const repo = new SpyMemoryRepository();
  const llm = new SequenceResponseLLM([
    "IMPLEMENT_ANALYSIS:\n- only english\nCHAT:\nhello\nNEXT_ACTION:",
    [
      "IMPLEMENT_ANALYSIS:",
      "- PRD 기준 구현 범위를 확정합니다. EVIDENCE: prd_summary",
      "- 변경 파일 순서대로 적용합니다. EVIDENCE: diff_name_only",
      "- 검증은 테스트부터 수행합니다. EVIDENCE: diff_stat",
      "CHAT:",
      "재시도 결과 형식이 정상입니다.",
      "NEXT_ACTION: npm test",
    ].join("\n"),
  ]);
  const app = buildGraph(repo, llm);
  installStandardRepoMock(t, "/tmp/retry-success-repo");

  const result = await app.invoke(
    makeInitialState(
      "PRD-10 구현하자",
      "project-retry-success",
      "/tmp/retry-success-repo",
      "IMPLEMENT"
    )
  );

  assert.equal(llm.calls, 2);
  assert.equal(result.supervisorOutput.status, "REVIEW_OK");
  assert.equal(result.outputs.implement_analysis.includes("PRD 기준 구현 범위를 확정합니다"), true);
  assert.equal(result.outputs.chat.includes("NEXT_ACTION: npm test"), true);
});
