import { Annotation, END, StateGraph } from "@langchain/langgraph";
import * as childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { MemoryRepository } from "../memory/memory.repository";
import { MemoryCard } from "../memory/memory.types";
import { LLMClient } from "../llm/llm.types";

export type SupervisorStatus = "NEED_CONTEXT" | "REVIEW_OK" | "CONFLICT";

export type SupervisorIssueSeverity = "high" | "mid" | "low";

export interface SupervisorIssue {
  severity: SupervisorIssueSeverity;
  title: string;
  evidence: string;
  recommendation: string;
}

export interface RequiredContextItem {
  key: string;
  why: string;
  how_to_get: string;
}

export interface SupervisorOutput {
  status: SupervisorStatus;
  facts_md: string;
  analysis_md: string;
  report_md: string;
  issues?: SupervisorIssue[];
  required_context?: RequiredContextItem[];
}

export interface RepoContextBundle {
  changed_files: string;
  diff_name_only: string;
  diff_stat: string;
  diff: string;
  file_snippets?: string;
  test_log?: string;
  scan_errors: string[];
}

export type SupervisorPhase = "PRD_DRAFT" | "IMPLEMENT" | "DIAGNOSE" | "CHAT";
export type OutputMode = "CHAT" | "COMPILE";

export interface PhaseOutputs {
  implement_analysis: string;
  chat: string;
  agent_prompt_md: string;
}

export interface GraphState {
  userInput: string;
  projectId: string;
  phase: SupervisorPhase;
  outputMode: OutputMode;
  outputs: PhaseOutputs;
  scanExecuted: boolean;
  repoPath: string;
  repoContextBundle: RepoContextBundle;
  prdId: string;
  prdFilePath: string;
  prdSummary: string;
  partialPrd: boolean;
  preflightNeedContext: boolean;
  preflightIssues: SupervisorIssue[];
  preflightRequiredContext: RequiredContextItem[];
  retryCount: number;
  retryPrompt: string;
  validateError: string;
  diffCapMetrics: string;
  retrieved: MemoryCard[];
  assembledPrompt: string;
  actOutput: string;
  supervisorOutput: SupervisorOutput;
  conflictDetected: boolean;
}

const GraphStateAnnotation = Annotation.Root({
  userInput: Annotation<string>,
  projectId: Annotation<string>,
  phase: Annotation<SupervisorPhase>,
  outputMode: Annotation<OutputMode>,
  outputs: Annotation<PhaseOutputs>,
  scanExecuted: Annotation<boolean>,
  repoPath: Annotation<string>,
  repoContextBundle: Annotation<RepoContextBundle>,
  prdId: Annotation<string>,
  prdFilePath: Annotation<string>,
  prdSummary: Annotation<string>,
  partialPrd: Annotation<boolean>,
  preflightNeedContext: Annotation<boolean>,
  preflightIssues: Annotation<SupervisorIssue[]>,
  preflightRequiredContext: Annotation<RequiredContextItem[]>,
  retryCount: Annotation<number>,
  retryPrompt: Annotation<string>,
  validateError: Annotation<string>,
  diffCapMetrics: Annotation<string>,
  retrieved: Annotation<MemoryCard[]>,
  assembledPrompt: Annotation<string>,
  actOutput: Annotation<string>,
  supervisorOutput: Annotation<SupervisorOutput>,
  conflictDetected: Annotation<boolean>,
});

const SUPERVISOR_PROMPT = `당신은 코드/문서 변경 분석가(Analyst) 입니다.
당신의 역할은 FACTS를 바탕으로 위험/영향을 추론하는 것입니다.

필수 규칙:
- JSON 출력 금지
- 코드블록 없이 일반 Markdown 문단/불릿으로만 작성
- 인사말/잡담 금지
- 모든 자연어 출력은 한국어로 작성(식별자/커맨드 제외)
- 추측/상상 금지. 제공된 Repo Context Bundle/Memory/Scan 결과에 없는 정보는 UNAVAILABLE로 표기
- 분석에 필수 정보가 부족하면 필요한 항목(또는 필요한 스캔)을 명확히 요청/나열 가능
- FACTS 재출력/요약/복사 금지

Instruction:
Write analysis only from the provided FACTS.`;

const CHAT_PROMPT = `당신은 대화 라우터(Concierge) 입니다.
역할:
- 사용자의 의도를 파악하고 다음 phase(PRD_DRAFT/IMPLEMENT/DIAGNOSE/CHAT)를 제안
- 스캔/번들 제공만 반복하지 말고, 먼저 의도를 좁히는 질문 1~2개를 제시
- 이 프로그램은 repo/PRD/구현/진단 작업을 돕는 supervisor/router 입니다.
- 사용자가 "그냥 대화"처럼 모호하게 말하면 일반 주제로 추측 확장하지 말고 의도를 좁히세요.
- TASK에 근거 없는 주제(여행/취미/연애 등)로 추측 확장 금지.
- repoPath는 시스템이 이미 알고 있으므로 repoPath 확인 질문은 하지 마세요.

출력 형식:
CHAT:
- 짧은 대화/질문 1~5줄
OPTIONAL_NEXT_PHASE:
- PRD_DRAFT | IMPLEMENT | DIAGNOSE | CHAT (선택)
OPTIONAL_REQUIRED_CONTEXT:
- 필요한 정보 0~3개 (명령형 금지, “가능하면 ~ 알려주면” 톤)

모든 자연어 출력은 한국어로 작성(식별자/커맨드 제외).
JSON 출력 금지.`;

const REPORT_RULES_SUFFIX = `출력은 아래 섹션만 사용:
IMPLEMENT_ANALYSIS:
- <구현 체크리스트/설계 bullet> EVIDENCE: <facts_key[,facts_key]>
CHAT:
- <사용자에게 전달할 핵심 내용>
NEXT_ACTION: <비어있지 않은 단일 쉘 커맨드>
OPTIONAL_REQUIRED_CONTEXT:
- <필요한 정보 0~3개>

Rules:
- 구현/진단 모드에서는 "변경 요약"이 아니라 PRD 요구사항 기반 구현 지시 관점으로 작성.
- IMPLEMENT_ANALYSIS는 3~8개 bullet.
- 각 bullet 끝에는 EVIDENCE: <facts_key> 포함.
- allowed facts_key: changed_files, diff_name_only, diff_stat, diff, file_snippets, test_log, scan_errors, prd_summary.
- FACTS 재출력/복사 금지.
- JSON 출력 금지.
- 모든 자연어는 한국어로 작성(식별자/커맨드 제외).`;

const DEFAULT_REQUIRED_CONTEXT = ["changed_files", "git_diff", "test_log"];
const DEFAULT_IMPLEMENT_ANALYSIS =
  "- 현재 컨텍스트에서 구현 리스크를 정확히 판정하기 어렵습니다. EVIDENCE: scan_errors";
const DEFAULT_CHAT =
  "현재 입력을 처리했지만 일부 정보가 부족합니다. 필요한 스캔/로그를 보강하면 정확도를 높일 수 있습니다.";
const DIFF_MAX_CHARS = 12000;
const DIFF_MAX_LINES = 3000;
const DIFF_SECTION_MAX_FILES = 8;
const DIFF_SECTION_HEAD_LINES = 120;
const DIFF_SECTION_TAIL_LINES = 80;

type CommandRunner = (command: string, cwd: string) => string;
type FileReader = (filePath: string) => string;

export const __graphTestHooks: {
  runCommand: CommandRunner;
  readFile: FileReader;
  extractPrdIdFromUserInput: (userInput: string) => string;
  inferPrdIdFromBundle: (bundle: RepoContextBundle) => string;
  capDiffForPrompt: (diff: string) => { value: string; metrics: string };
} = {
  runCommand(command: string, cwd: string): string {
    return childProcess.execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  },
  readFile(filePath: string): string {
    return fs.readFileSync(filePath, "utf8");
  },
  extractPrdIdFromUserInput(userInput: string): string {
    return extractPrdIdFromUserInput(userInput);
  },
  inferPrdIdFromBundle(bundle: RepoContextBundle): string {
    return inferPrdIdFromBundle(bundle);
  },
  capDiffForPrompt(diff: string): { value: string; metrics: string } {
    return capDiffForPrompt(diff);
  },
};

export interface GraphHooks {
  onBeforeAct?: (state: GraphState) => void;
}

interface ValidationResult {
  ok: boolean;
  reason?: string;
}

function normalizePhase(phase: string | undefined): SupervisorPhase {
  if (phase === "PRD_DRAFT") return "PRD_DRAFT";
  if (phase === "IMPLEMENT") return "IMPLEMENT";
  if (phase === "DIAGNOSE") return "DIAGNOSE";
  return "CHAT";
}

function detectCompileTrigger(userInput: string): boolean {
  return /(코덱스\s*지시문|구현\s*지시\s*만들|문서\s*작성\s*지시\s*생성|codex\s*prompt|compile)/i.test(
    userInput
  );
}

function normalizeOutputMode(
  outputMode: string | undefined,
  userInput: string
): OutputMode {
  if (outputMode === "COMPILE") return "COMPILE";
  if (detectCompileTrigger(userInput)) return "COMPILE";
  return "CHAT";
}

function shouldRunRepoScan(phase: SupervisorPhase): boolean {
  return phase === "IMPLEMENT" || phase === "DIAGNOSE";
}

function validateLlmOutput(text: string): ValidationResult {
  if (!text.includes("IMPLEMENT_ANALYSIS:")) {
    return { ok: false, reason: "missing IMPLEMENT_ANALYSIS section" };
  }
  if (!text.includes("CHAT:")) {
    return { ok: false, reason: "missing CHAT section" };
  }
  const hasNextAction = text.includes("NEXT_ACTION:");
  const hasOptionalNextPhase = text.includes("OPTIONAL_NEXT_PHASE:");
  if (!hasNextAction && !hasOptionalNextPhase) {
    return { ok: false, reason: "missing NEXT_ACTION or OPTIONAL_NEXT_PHASE section" };
  }

  if (hasNextAction) {
    const nextActionMatch = text.match(/NEXT_ACTION:\s*([^\n\r]*)/);
    if (!nextActionMatch || nextActionMatch[1].trim() === "") {
      return { ok: false, reason: "empty NEXT_ACTION" };
    }
  }

  if (!hasNextAction && hasOptionalNextPhase) {
    const phaseMatch = text.match(/OPTIONAL_NEXT_PHASE:\s*([^\n\r]*)/);
    if (!phaseMatch || phaseMatch[1].trim() === "") {
      return { ok: false, reason: "empty OPTIONAL_NEXT_PHASE" };
    }
  }

  if (!/[가-힣]/.test(text)) {
    return { ok: false, reason: "non-korean output" };
  }

  return { ok: true };
}

function detectIntentPhase(userInput: string): SupervisorPhase {
  const hasImplement = /(구현|implement|implementation)/i.test(userInput);
  const hasPrd = /\bPRD[\s-]*\d+\b/i.test(userInput);
  const hasDraft =
    /(작성|짜|드래프트|문서|spec|설계|PRD\s*작성)/i.test(userInput);
  const hasDiagnose =
    /(진단|디버그|오류|버그|왜 안돼|fail|broken)/i.test(userInput);

  if (hasImplement) return "IMPLEMENT";
  if (hasDiagnose) return "DIAGNOSE";
  if (hasPrd && hasDraft) return "PRD_DRAFT";
  if (hasDraft) return "PRD_DRAFT";
  return "CHAT";
}

function inferRecommendedPhase(userInput: string): SupervisorPhase {
  return detectIntentPhase(userInput);
}

function normalizePrdId(raw: string): string {
  const numeric = Number.parseInt(raw, 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "";
  }
  return String(numeric).padStart(3, "0");
}

function extractPrdIdFromUserInput(userInput: string): string {
  const match = userInput.match(/PRD[\s-]?(\d{1,4})/i);
  return match ? normalizePrdId(match[1]) : "";
}

function inferPrdIdFromBundle(bundle: RepoContextBundle): string {
  const haystack = `${bundle.diff_name_only}\n${bundle.changed_files}`;
  const matches = [...haystack.matchAll(/docs\/prd\/PRD-(\d{1,4})[^/\n]*\.md/gi)];
  if (matches.length === 0) {
    return "";
  }
  return normalizePrdId(matches[0][1]);
}

function listPrdFilesFromRepo(repoPath: string): string[] {
  const tracked = runCommandOrUnavailable("git ls-files docs/prd", repoPath);
  if (tracked.value !== "UNAVAILABLE" && tracked.value !== "(none)") {
    return tracked.value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && line.endsWith(".md"));
  }
  return [];
}

function resolvePrdCandidates(
  prdId: string,
  bundle: RepoContextBundle,
  repoPath: string
): string[] {
  const changedCandidates = extractChangedPaths(bundle).filter((candidate) =>
    /^docs\/prd\/PRD-\d+[^/]*\.md$/.test(candidate)
  );
  const allCandidates =
    changedCandidates.length > 0 ? changedCandidates : listPrdFilesFromRepo(repoPath);
  const prdNumeric = Number.parseInt(prdId, 10);
  if (!Number.isFinite(prdNumeric)) {
    return [];
  }

  return allCandidates.filter((candidate) => {
    const match = candidate.match(/docs\/prd\/PRD-(\d{1,4})[^/]*\.md/i);
    if (!match) {
      return false;
    }
    return Number.parseInt(match[1], 10) === prdNumeric;
  });
}

function scorePrdCandidate(candidate: string, normalizedPrdId: string): number {
  const baseName = path.posix.basename(candidate).toLowerCase();
  let score = 0;
  if (baseName.includes(`prd-${normalizedPrdId.toLowerCase()}_`)) {
    score += 4;
  }
  if (/(implement|implementation|build|patch|fix|migration|integration)/.test(baseName)) {
    score += 2;
  }
  if (/(draft|proposal|analysis)/.test(baseName)) {
    score += 1;
  }
  return score;
}

function selectBestPrdFile(
  candidates: string[],
  normalizedPrdId: string
): { selected: string; reason: string } | null {
  if (candidates.length === 0) {
    return null;
  }
  const ranked = [...candidates]
    .map((candidate) => ({
      candidate,
      score: scorePrdCandidate(candidate, normalizedPrdId),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.candidate.length !== b.candidate.length) {
        return a.candidate.length - b.candidate.length;
      }
      return a.candidate.localeCompare(b.candidate);
    });
  const winner = ranked[0];
  return {
    selected: winner.candidate,
    reason: `score=${winner.score}, candidates=${candidates.length}`,
  };
}

function extractSectionByHeading(markdown: string, headingMatchers: RegExp[]): string {
  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let capture = false;
  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      const title = headingMatch[1].trim();
      capture = headingMatchers.some((matcher) => matcher.test(title));
      continue;
    }
    if (capture) {
      chunks.push(line);
    }
  }
  return chunks.join("\n").trim();
}

function summarizePrdMarkdown(markdown: string): { summary: string; partialPrd: boolean } {
  const objective = extractSectionByHeading(markdown, [/objective/i, /목표/]);
  const scope = extractSectionByHeading(markdown, [/scope/i, /범위/]);
  const nonGoals = extractSectionByHeading(markdown, [/non[-\s]?goals?/i, /비목표/, /non goal/i]);
  const requirements = extractSectionByHeading(markdown, [/requirements?/i, /요구사항/, /must|should/i]);
  const constraints = extractSectionByHeading(markdown, [/constraints?/i, /제약/, /금지/, /read[-\s]?only/i]);
  const acceptance = extractSectionByHeading(markdown, [/acceptance/i, /done definition/i, /완료/, /검증/]);
  const files = extractSectionByHeading(markdown, [/files?/i, /modules?/i, /touched/i, /변경 파일/]);

  const hasStructuredSections = [
    objective,
    scope,
    nonGoals,
    requirements,
    constraints,
    acceptance,
    files,
  ].some((section) => section !== "");

  if (!hasStructuredSections) {
    const partial = markdown.split("\n").slice(0, 180).join("\n");
    return {
      summary: `partial_prd=true\n${partial}`.trim(),
      partialPrd: true,
    };
  }

  const rows = [
    "Objective/Scope:",
    [objective, scope].filter((section) => section !== "").join("\n"),
    "",
    "Non-goals:",
    nonGoals || "UNAVAILABLE",
    "",
    "Requirements:",
    requirements || "UNAVAILABLE",
    "",
    "Constraints:",
    constraints || "UNAVAILABLE",
    "",
    "Acceptance:",
    acceptance || "UNAVAILABLE",
    "",
    "Files/Modules touched:",
    files || "UNAVAILABLE",
  ];
  return {
    summary: rows.join("\n").trim(),
    partialPrd: false,
  };
}

function parseChatOutput(raw: string, userInput: string): PhaseOutputs {
  const recommendedPhase = inferRecommendedPhase(userInput);

  const chatQuestion =
    recommendedPhase === "IMPLEMENT"
      ? "- 바로 구현으로 진행할까요? PRD 문서는 이미 확정인가요?"
      : recommendedPhase === "PRD_DRAFT"
      ? "- PRD 초안 작성부터 시작할까요, 아니면 기존 PRD를 보강할까요?"
      : recommendedPhase === "DIAGNOSE"
      ? "- 어떤 오류/증상이 가장 먼저 해결 대상인가요?"
      : '- 지금 원하는 건 무엇인가요? [PRD 작성 / 구현 / 진단 / 그냥 잡담] 중에 가까운 걸 골라주세요.';

  const chat = [
    chatQuestion,
    "",
    "OPTIONAL_NEXT_PHASE:",
    `- ${recommendedPhase}`,
    "OPTIONAL_REQUIRED_CONTEXT:",
    "- (none)",
  ].join("\n");

  return {
    implement_analysis: "(none)",
    chat,
    agent_prompt_md: "",
  };
}

function parseChannelOutput(
  raw: string,
  phase: SupervisorPhase,
  userInput: string
): PhaseOutputs {
  if (phase === "CHAT") {
    return parseChatOutput(raw, userInput);
  }

  const implementMarker = "IMPLEMENT_ANALYSIS:";
  const chatMarker = "CHAT:";
  const nextActionMarker = "NEXT_ACTION:";
  const implementIndex = raw.indexOf(implementMarker);
  const chatIndex = raw.indexOf(chatMarker);

  if (implementIndex === -1 || chatIndex === -1 || chatIndex <= implementIndex) {
    return {
      implement_analysis: DEFAULT_IMPLEMENT_ANALYSIS,
      chat: raw.trim() === "" ? DEFAULT_CHAT : raw.trim(),
      agent_prompt_md: "",
    };
  }

  const implementStart = implementIndex + implementMarker.length;
  const chatStart = chatIndex + chatMarker.length;
  const nextActionIndex = raw.indexOf(nextActionMarker, chatStart);

  const implementAnalysis = raw.slice(implementStart, chatIndex).trim();
  const chatBody =
    nextActionIndex === -1
      ? raw.slice(chatStart).trim()
      : raw.slice(chatStart, nextActionIndex).trim();
  const nextActionLine =
    nextActionIndex === -1 ? "" : raw.slice(nextActionIndex).split("\n")[0].trim();

  const normalizedImplement =
    implementAnalysis === "" ? DEFAULT_IMPLEMENT_ANALYSIS : implementAnalysis;
  const normalizedChatParts = [chatBody, nextActionLine].filter(
    (part) => part.trim() !== ""
  );
  const normalizedChat =
    normalizedChatParts.length > 0
      ? normalizedChatParts.join("\n")
      : DEFAULT_CHAT;

  return {
    implement_analysis: normalizedImplement,
    chat: normalizedChat,
    agent_prompt_md: "",
  };
}

function renderOutputsMd(outputs: PhaseOutputs): string {
  const rows = [
    "IMPLEMENT_ANALYSIS:",
    outputs.implement_analysis,
    "",
    "CHAT:",
    outputs.chat,
  ];
  if (outputs.agent_prompt_md.trim() !== "") {
    rows.push("", "AGENT_PROMPT:", outputs.agent_prompt_md);
  }
  return rows.join("\n");
}

function buildRetryContextSummary(state: GraphState): string {
  if (!state.scanExecuted) {
    return "scan_context: UNAVAILABLE";
  }

  const fileSnippets =
    typeof state.repoContextBundle.file_snippets === "string"
      ? state.repoContextBundle.file_snippets.slice(0, 800)
      : "UNAVAILABLE";

  return [
    `prd_id: ${state.prdId || "UNAVAILABLE"}`,
    `prd_file: ${state.prdFilePath || "UNAVAILABLE"}`,
    `prd_summary: ${state.prdSummary || "UNAVAILABLE"}`,
    `changed_files: ${state.repoContextBundle.changed_files}`,
    `diff_name_only: ${state.repoContextBundle.diff_name_only}`,
    `diff_stat: ${state.repoContextBundle.diff_stat}`,
    `file_snippets: ${fileSnippets}`,
  ].join("\n");
}

function buildImplementRetryPrompt(state: GraphState, reason: string): string {
  return [
    "이전 응답이 형식을 지키지 못했습니다.",
    `실패 사유: ${reason}`,
    "",
    "반드시 한국어로만 아래 섹션을 정확히 출력하세요.",
    "IMPLEMENT_ANALYSIS:",
    "- 3~8개 bullet, 각 줄 끝에 EVIDENCE: <key>",
    "CHAT:",
    "- 1~5줄",
    "NEXT_ACTION: <비어있지 않은 단일 쉘 커맨드>",
    "",
    "추측 금지. 근거 없는 내용은 UNAVAILABLE로 표기.",
    "다음 컨텍스트만 참고하세요:",
    buildRetryContextSummary(state),
  ].join("\n");
}

function fallbackOutput(state: GraphState): PhaseOutputs {
  const prdMatch = state.userInput.match(/PRD[\s-]*(\d+)/i);
  const prdNum = prdMatch?.[1];
  const nextAction = prdNum
    ? `rg --files docs/prd | rg "PRD[-_ ]*${prdNum}"`
    : "rg --files docs/prd | head -n 20";

  const evidenceKey =
    state.scanExecuted && state.repoContextBundle.diff_name_only !== "UNAVAILABLE"
      ? "diff_name_only"
      : "scan_errors";

  return {
    implement_analysis: [
      `- LLM 출력 형식이 불안정해 규칙 기반 폴백을 적용했습니다. EVIDENCE: ${evidenceKey}`,
      `- 현재 입력은 구현 진행 의도로 해석되며 핵심 대상 식별이 우선입니다. EVIDENCE: ${evidenceKey}`,
      `- PRD 요약 기반으로 단계적 구현 지시를 우선 준비해야 합니다. EVIDENCE: prd_summary`,
    ].join("\n"),
    chat: [
      `요청 "${state.userInput}" 기준으로 구현을 진행하려면 PRD 관련 파일 위치를 먼저 확인하는 것이 안전합니다.`,
      `NEXT_ACTION: ${nextAction}`,
    ].join("\n"),
    agent_prompt_md: "",
  };
}

function buildCompileAgentPrompt(state: GraphState, outputs: PhaseOutputs): string {
  if (state.outputMode !== "COMPILE") {
    return "";
  }
  if (!shouldRunRepoScan(state.phase)) {
    return "";
  }

  return [
    "Codex/Gemini Implementation Instruction",
    `- target_phase: ${state.phase}`,
    `- repo_path: ${state.repoPath}`,
    `- prd_id: ${state.prdId || "UNAVAILABLE"}`,
    `- prd_file: ${state.prdFilePath || "UNAVAILABLE"}`,
    "",
    "1) 변경 파일 후보 확인",
    state.repoContextBundle.diff_name_only,
    "",
    "2) 구현 순서",
    outputs.implement_analysis,
    "",
    "3) 테스트/검증",
    outputs.chat,
    "",
    "주의사항:",
    "- 외부 repoPath는 READ-ONLY",
    "- deterministic 결과 유지",
    "- repo_scan 규칙 준수",
  ].join("\n");
}

function requiredContextFromKey(key: string): RequiredContextItem {
  if (key === "changed_files") {
    return {
      key,
      why: "Required to know what changed",
      how_to_get: "Provide list of changed files or git status/diff",
    };
  }

  if (key === "git_diff") {
    return {
      key,
      why: "Required to review changes",
      how_to_get: "Provide git diff",
    };
  }

  if (key === "test_log") {
    return {
      key,
      why: "Required to assess failures",
      how_to_get: "Provide npm test output",
    };
  }

  return {
    key,
    why: "Required context",
    how_to_get: "Provide relevant snippet/log",
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function makeLlmTimeoutNeedContextOutput(
  factsMd: string,
  issueTitle: "LLM_TIMEOUT" | "LLM_ERROR",
  issueEvidence: string
): {
  supervisorOutput: SupervisorOutput;
  outputs: PhaseOutputs;
  reportMd: string;
} {
  const outputs: PhaseOutputs = {
    implement_analysis:
      "- LLM 호출 실패로 구현 분석이 제한됩니다. EVIDENCE: scan_errors",
    chat:
      issueTitle === "LLM_TIMEOUT"
        ? "모델 응답이 시간 내 완료되지 않았습니다. 타임아웃을 늘리고 다시 시도해 주세요."
        : "모델 호출 중 오류가 발생했습니다. 환경/연결 상태를 확인한 뒤 다시 시도해 주세요.",
    agent_prompt_md: "",
  };
  const analysisMd = renderOutputsMd(outputs);
  const reportMd = factsMd.trim() === "" ? analysisMd : `${factsMd}\n\n${analysisMd}`;

  const supervisorOutput: SupervisorOutput = {
    status: "NEED_CONTEXT",
    facts_md: factsMd,
    analysis_md: analysisMd,
    report_md: reportMd,
    issues: [
      {
        severity: "low",
        title: issueTitle,
        evidence: issueEvidence,
        recommendation: "OLLAMA_TIMEOUT_MS를 늘리거나 모델/연결 상태를 점검하세요.",
      },
    ],
    required_context: [],
  };

  return {
    supervisorOutput,
    outputs,
    reportMd,
  };
}

interface CommandResult {
  value: string;
  error?: string;
}

function runCommandOrUnavailable(command: string, cwd: string): CommandResult {
  try {
    const output = __graphTestHooks.runCommand(command, cwd).trim();
    return {
      value: output === "" ? "(none)" : output,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      value: "UNAVAILABLE",
      error: `${command} failed: ${message}`,
    };
  }
}

function limitByLinesAndChars(input: string, maxLines: number, maxChars: number): string {
  const byLines = input.split("\n").slice(0, maxLines).join("\n");
  if (byLines.length <= maxChars) {
    return byLines;
  }
  return `${byLines.slice(0, maxChars)}\n...[TRUNCATED]`;
}

function normalizeDiffNameOnly(diffNameOnly: string): string[] {
  if (diffNameOnly === "UNAVAILABLE" || diffNameOnly === "(none)") {
    return [];
  }

  return diffNameOnly
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      if (line.startsWith('"') && line.endsWith('"')) {
        return line.slice(1, -1);
      }
      return line;
    });
}

function splitDiffIntoSections(diff: string): string[] {
  if (diff === "UNAVAILABLE" || diff.trim() === "") {
    return [];
  }
  const lines = diff.split("\n");
  const sections: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith("diff --git ") && current.length > 0) {
      sections.push(current.join("\n"));
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    sections.push(current.join("\n"));
  }
  return sections;
}

function capSingleDiffSection(section: string): string {
  const lines = section.split("\n");
  if (lines.length <= DIFF_SECTION_HEAD_LINES + DIFF_SECTION_TAIL_LINES) {
    return section;
  }
  const head = lines.slice(0, DIFF_SECTION_HEAD_LINES);
  const tail = lines.slice(-DIFF_SECTION_TAIL_LINES);
  return [
    ...head,
    `... [TRUNCATED middle ${lines.length - head.length - tail.length} lines] ...`,
    ...tail,
  ].join("\n");
}

function capDiffForPrompt(diff: string): { value: string; metrics: string } {
  if (diff === "UNAVAILABLE") {
    return { value: "UNAVAILABLE", metrics: "lines=0 chars=11 sections=0 capped=false" };
  }

  const sections = splitDiffIntoSections(diff);
  const selectedSections = sections.slice(0, DIFF_SECTION_MAX_FILES).map(capSingleDiffSection);
  let merged = selectedSections.join("\n");
  let capped = sections.length > DIFF_SECTION_MAX_FILES;
  if (sections.length > DIFF_SECTION_MAX_FILES) {
    merged = `${merged}\n... [TRUNCATED sections ${sections.length - DIFF_SECTION_MAX_FILES}] ...`;
  }

  let lines = merged.split("\n");
  if (lines.length > DIFF_MAX_LINES) {
    lines = lines.slice(0, DIFF_MAX_LINES);
    lines.push("... [TRUNCATED lines] ...");
    capped = true;
  }

  let value = lines.join("\n");
  if (value.length > DIFF_MAX_CHARS) {
    const marker = "\n... [TRUNCATED chars] ...";
    const allowedChars = Math.max(0, DIFF_MAX_CHARS - marker.length);
    value = `${value.slice(0, allowedChars)}${marker}`;
    if (value.length > DIFF_MAX_CHARS) {
      value = value.slice(0, DIFF_MAX_CHARS);
    }
    capped = true;
  }

  return {
    value,
    metrics: `lines=${value.split("\n").length} chars=${value.length} sections=${sections.length} capped=${capped}`,
  };
}

function buildFactsDiffSection(diff: string): string {
  if (diff === "UNAVAILABLE") {
    return "UNAVAILABLE";
  }

  const originalLines = diff.split("\n");
  const hadTruncatedMarker = diff.includes("[TRUNCATED]");
  const cleanedLines = originalLines.filter(
    (line) => line.trim() !== "...[TRUNCATED]" && line.trim() !== "[TRUNCATED]"
  );
  const first120 = cleanedLines.slice(0, 120).join("\n");
  const wasTruncated = hadTruncatedMarker || cleanedLines.length > 120;

  if (!wasTruncated) {
    return first120;
  }

  return `${first120}\nTRUNCATED`;
}

function buildFactsFileSnippetsSection(fileSnippets?: string): string {
  if (typeof fileSnippets !== "string" || fileSnippets.trim() === "") {
    return "(none)";
  }
  if (fileSnippets === "UNAVAILABLE" || fileSnippets === "(none)") {
    return fileSnippets;
  }

  const lines = fileSnippets.split("\n");
  const entries: Array<{ path: string; snippet: string[] }> = [];
  let current: { path: string; snippet: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (current) {
        entries.push(current);
      }
      current = { path: line.slice(4).trim(), snippet: [] };
      continue;
    }
    if (current) {
      current.snippet.push(line);
    }
  }

  if (current) {
    entries.push(current);
  }

  if (entries.length === 0) {
    return fileSnippets;
  }

  return entries
    .map((entry) => {
      const body = entry.snippet.join("\n").trim();
      return `- ${entry.path}\n${body === "" ? "(none)" : body}`;
    })
    .join("\n");
}

function renderFactsMd(
  bundle: RepoContextBundle,
  repoPath: string,
  prdSummary: string = "UNAVAILABLE",
  prdId: string = "",
  prdFilePath: string = ""
): string {
  const normalizedRepoPath = repoPath.trim() === "" ? "UNAVAILABLE" : repoPath;
  const changedFiles =
    typeof bundle.changed_files === "string" && bundle.changed_files.trim() !== ""
      ? bundle.changed_files
      : "UNAVAILABLE";
  const diffNameOnly =
    typeof bundle.diff_name_only === "string" && bundle.diff_name_only.trim() !== ""
      ? bundle.diff_name_only
      : "UNAVAILABLE";
  const diffStat =
    typeof bundle.diff_stat === "string" && bundle.diff_stat.trim() !== ""
      ? bundle.diff_stat
      : "UNAVAILABLE";
  const diffSection = buildFactsDiffSection(
    typeof bundle.diff === "string" && bundle.diff.trim() !== "" ? bundle.diff : "UNAVAILABLE"
  );
  const fileSnippetsSection = buildFactsFileSnippetsSection(bundle.file_snippets);
  const testLog =
    typeof bundle.test_log === "string" && bundle.test_log.trim() !== ""
      ? bundle.test_log
      : "UNAVAILABLE";
  const scanErrors =
    Array.isArray(bundle.scan_errors) && bundle.scan_errors.length > 0
      ? bundle.scan_errors.map((item) => `- ${item}`).join("\n")
      : "- (none)";

  return [
    "FACTS:",
    `- repo_path: ${normalizedRepoPath}`,
    `- prd_id: ${prdId === "" ? "UNAVAILABLE" : prdId}`,
    `- prd_file: ${prdFilePath === "" ? "UNAVAILABLE" : prdFilePath}`,
    "",
    "prd_summary:",
    prdSummary === "" ? "UNAVAILABLE" : prdSummary,
    "",
    "changed_files:",
    changedFiles,
    "",
    "diff_name_only:",
    diffNameOnly,
    "",
    "diff_stat:",
    diffStat,
    "",
    "diff:",
    diffSection,
    "",
    "file_snippets:",
    fileSnippetsSection,
    "",
    "scan_errors:",
    scanErrors,
    "",
    "test_log:",
    testLog,
  ].join("\n");
}

function collectFileSnippets(repoPath: string, diffNameOnly: string): {
  value: string;
  errors: string[];
} {
  if (diffNameOnly === "UNAVAILABLE") {
    return { value: "UNAVAILABLE", errors: [] };
  }

  const files = normalizeDiffNameOnly(diffNameOnly).slice(0, 5);
  if (files.length === 0) {
    return { value: "(none)", errors: [] };
  }

  const chunks: string[] = [];
  const errors: string[] = [];
  for (const relativePath of files) {
    const absolutePath = path.resolve(repoPath, relativePath);
    try {
      const raw = __graphTestHooks.readFile(absolutePath);
      const snippet = limitByLinesAndChars(raw, 200, 12000);
      chunks.push(`### ${relativePath}\n${snippet}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`read ${relativePath} failed: ${message}`);
      chunks.push(`### ${relativePath}\nUNAVAILABLE`);
    }
  }

  return {
    value: chunks.join("\n\n"),
    errors,
  };
}

function collectContextBundle(repoPath: string): RepoContextBundle {
  const status = runCommandOrUnavailable("git status --porcelain", repoPath);
  const diffNameOnly = runCommandOrUnavailable("git diff --name-only", repoPath);
  const diffStat = runCommandOrUnavailable("git diff --stat", repoPath);
  const rawDiff = runCommandOrUnavailable("git diff", repoPath);
  const cappedDiff = capDiffForPrompt(rawDiff.value);

  const snippets = collectFileSnippets(repoPath, diffNameOnly.value);

  const scanErrors = [
    status.error,
    diffNameOnly.error,
    diffStat.error,
    rawDiff.error,
    ...snippets.errors,
  ].filter((item): item is string => typeof item === "string" && item !== "");

  return {
    changed_files: status.value,
    diff_name_only: diffNameOnly.value,
    diff_stat: diffStat.value,
    diff: cappedDiff.value,
    file_snippets: snippets.value,
    test_log: "UNAVAILABLE",
    scan_errors: scanErrors,
  };
}

function extractChangedPaths(bundle: RepoContextBundle): string[] {
  const fromStatus: string[] = [];
  for (const line of bundle.changed_files.split("\n")) {
    if (line.trim() === "") {
      continue;
    }

    const candidate = line.length >= 4 ? line.slice(3).trim() : "";
    if (candidate === "") {
      continue;
    }

    const next = candidate.includes(" -> ")
      ? (candidate.split(" -> ").pop() ?? "").trim()
      : candidate;
    if (next !== "") {
      fromStatus.push(next);
    }
  }

  const merged = new Set<string>([...fromStatus, ...normalizeDiffNameOnly(bundle.diff_name_only)]);
  return [...merged];
}

function computeStructuralConflictIssues(bundle: RepoContextBundle): SupervisorIssue[] {
  const changedPaths = extractChangedPaths(bundle);
  const issues: SupervisorIssue[] = [];
  const prdIdToPaths = new Map<string, string[]>();

  for (const changedPath of changedPaths) {
    if (!changedPath.startsWith("docs/prd/") || !changedPath.endsWith(".md")) {
      continue;
    }

    const baseName = path.posix.basename(changedPath);
    const validPrdName = /^PRD-\d+_[A-Za-z0-9._-]+\.md$/;
    if (!validPrdName.test(baseName)) {
      issues.push({
        severity: "mid",
        title: "PRD_NAMING_VIOLATION",
        evidence: changedPath,
        recommendation:
          "PRD 파일명은 docs/prd/PRD-<숫자>_<slug>.md 규칙으로 정리하세요.",
      });
      continue;
    }

    const idMatch = baseName.match(/^PRD-(\d+)_/);
    if (!idMatch) {
      continue;
    }

    const id = idMatch[1];
    const list = prdIdToPaths.get(id) ?? [];
    list.push(changedPath);
    prdIdToPaths.set(id, list);
  }

  for (const [id, paths] of prdIdToPaths.entries()) {
    if (paths.length > 1) {
      issues.push({
        severity: "high",
        title: "DUPLICATE_PRD_ID",
        evidence: `PRD-${id} duplicated in: ${paths.join(", ")}`,
        recommendation: "동일 PRD ID는 하나의 파일로 통합하고 나머지는 제거/리다이렉트하세요.",
      });
    }
  }

  return issues;
}

function evaluateSupervisorOutput(state: GraphState): {
  status: SupervisorStatus;
  issues: SupervisorIssue[];
  required_context?: RequiredContextItem[];
} {
  if (!shouldRunRepoScan(state.phase)) {
    return {
      status: "REVIEW_OK",
      issues: [],
    };
  }

  const unavailableKeys: string[] = [];
  if (state.repoContextBundle.changed_files === "UNAVAILABLE") {
    unavailableKeys.push("changed_files");
  }
  if (state.repoContextBundle.diff_name_only === "UNAVAILABLE") {
    unavailableKeys.push("changed_files");
  }
  if (state.repoContextBundle.diff_stat === "UNAVAILABLE") {
    unavailableKeys.push("changed_files");
  }
  if (state.repoContextBundle.diff === "UNAVAILABLE") {
    unavailableKeys.push("git_diff");
  }

  const dedupedRequired = [...new Set(unavailableKeys)].map((key) =>
    requiredContextFromKey(key)
  );

  if (state.repoContextBundle.scan_errors.length > 0 || dedupedRequired.length > 0) {
    const issues: SupervisorIssue[] = [
      {
        severity: "mid",
        title: "SCAN_FAILED",
        evidence:
          state.repoContextBundle.scan_errors.length > 0
            ? state.repoContextBundle.scan_errors.join(" | ")
            : "Repo context bundle has UNAVAILABLE fields.",
        recommendation: "repoPath 권한/git 상태를 확인하고 다시 실행하세요.",
      },
    ];

    const requiredContext =
      dedupedRequired.length > 0
        ? dedupedRequired
        : DEFAULT_REQUIRED_CONTEXT.map((key) => requiredContextFromKey(key));

    return {
      status: "NEED_CONTEXT",
      issues,
      required_context: requiredContext,
    };
  }

  const structuralIssues = computeStructuralConflictIssues(state.repoContextBundle);
  if (structuralIssues.length > 0) {
    return {
      status: "CONFLICT",
      issues: structuralIssues,
    };
  }

  return {
    status: "REVIEW_OK",
    issues: [],
  };
}

async function recallNode(
  state: GraphState,
  repo: MemoryRepository
): Promise<Partial<GraphState>> {
  const [decisions, latestState] = await Promise.all([
    repo.getByType("decision"),
    repo.getLatestState(state.projectId),
  ]);

  const retrieved = latestState ? [...decisions, latestState] : decisions;
  return { retrieved };
}

async function entryNode(state: GraphState): Promise<Partial<GraphState>> {
  const normalizedPhase = normalizePhase(state.phase);
  const inferredPhase = detectIntentPhase(state.userInput);
  const phase =
    normalizedPhase === "CHAT" && inferredPhase !== "CHAT"
      ? inferredPhase
      : normalizedPhase;

  return {
    phase,
    outputMode: normalizeOutputMode(state.outputMode, state.userInput),
    retryCount: 0,
    retryPrompt: "",
    validateError: "",
  };
}

async function phaseImplementNode(): Promise<Partial<GraphState>> {
  return { phase: "IMPLEMENT" };
}

async function phaseDiagnoseNode(): Promise<Partial<GraphState>> {
  return { phase: "DIAGNOSE" };
}

async function phasePrdDraftNode(): Promise<Partial<GraphState>> {
  return { phase: "PRD_DRAFT" };
}

async function phaseChatNode(): Promise<Partial<GraphState>> {
  return { phase: "CHAT" };
}

async function repoScanNode(state: GraphState): Promise<Partial<GraphState>> {
  const resolvedRepoPath = path.resolve(state.repoPath);
  const contextBundle = collectContextBundle(resolvedRepoPath);
  return {
    scanExecuted: true,
    repoPath: resolvedRepoPath,
    repoContextBundle: contextBundle,
  };
}

function makePrdNeedContext(issueEvidence: string): {
  preflightNeedContext: boolean;
  preflightIssues: SupervisorIssue[];
  preflightRequiredContext: RequiredContextItem[];
  prdSummary: string;
} {
  return {
    preflightNeedContext: true,
    preflightIssues: [
      {
        severity: "mid",
        title: "PRD_NOT_FOUND",
        evidence: issueEvidence,
        recommendation: "PRD id 또는 docs/prd 내 PRD 파일 경로를 제공하세요.",
      },
    ],
    preflightRequiredContext: [
      {
        key: "prd_id_or_path",
        why: "PRD 기반 구현 지시 생성을 위해 대상 PRD 식별이 필요합니다.",
        how_to_get: "예: PRD-010 또는 docs/prd/PRD-010_xxx.md",
      },
    ],
    prdSummary: "UNAVAILABLE",
  };
}

async function prdLoadNode(state: GraphState): Promise<Partial<GraphState>> {
  if (!shouldRunRepoScan(state.phase)) {
    return {
      prdId: "",
      prdFilePath: "",
      prdSummary: "UNAVAILABLE",
      partialPrd: false,
      preflightNeedContext: false,
      preflightIssues: [],
      preflightRequiredContext: [],
    };
  }

  const fromInput = extractPrdIdFromUserInput(state.userInput);
  const resolvedPrdId = fromInput !== "" ? fromInput : inferPrdIdFromBundle(state.repoContextBundle);

  if (resolvedPrdId === "") {
    return makePrdNeedContext("No PRD id in input and no PRD candidate in repo scan context.");
  }

  const candidates = resolvePrdCandidates(resolvedPrdId, state.repoContextBundle, state.repoPath);
  const selected = selectBestPrdFile(candidates, resolvedPrdId);

  if (!selected) {
    return makePrdNeedContext(`No file matched docs/prd/PRD-${resolvedPrdId}*.md`);
  }

  const absolutePath = path.resolve(state.repoPath, selected.selected);
  try {
    const prdRaw = __graphTestHooks.readFile(absolutePath);
    const summary = summarizePrdMarkdown(prdRaw);
    if (process.env.DEBUG_PROMPT === "1") {
      console.log("----- prd_load_selection -----");
      console.log(`prd_id=${resolvedPrdId}`);
      console.log(`file=${selected.selected}`);
      console.log(`reason=${selected.reason}`);
      console.log(`partial_prd=${summary.partialPrd}`);
    }
    return {
      prdId: resolvedPrdId,
      prdFilePath: selected.selected,
      prdSummary: summary.summary,
      partialPrd: summary.partialPrd,
      preflightNeedContext: false,
      preflightIssues: [],
      preflightRequiredContext: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return makePrdNeedContext(`Failed to read ${selected.selected}: ${message}`);
  }
}

async function assembleNode(state: GraphState): Promise<Partial<GraphState>> {
  const promptLines = [
    state.phase === "CHAT" ? CHAT_PROMPT : SUPERVISOR_PROMPT,
    "",
    `PHASE: ${state.phase}`,
    `OUTPUT_MODE: ${state.outputMode}`,
    "",
    "TASK:",
    state.userInput,
  ];

  if (state.scanExecuted && shouldRunRepoScan(state.phase)) {
    const cappedDiff = capDiffForPrompt(state.repoContextBundle.diff);
    const scanErrors =
      state.repoContextBundle.scan_errors.length > 0
        ? state.repoContextBundle.scan_errors.join(" | ")
        : "(none)";

    promptLines.push(
      "",
      "## Repo Context Bundle",
      `- repo_path: ${state.repoPath}`,
      `- changed_files: ${state.repoContextBundle.changed_files}`,
      `- diff_name_only: ${state.repoContextBundle.diff_name_only}`,
      `- diff_stat: ${state.repoContextBundle.diff_stat}`,
      `- diff: ${cappedDiff.value}`,
      `- file_snippets: ${state.repoContextBundle.file_snippets ?? "UNAVAILABLE"}`,
      `- test_log: ${state.repoContextBundle.test_log ?? "UNAVAILABLE"}`,
      `- scan_errors: ${scanErrors}`,
      "",
      "## PRD SUMMARY",
      `- prd_id: ${state.prdId === "" ? "UNAVAILABLE" : state.prdId}`,
      `- prd_file: ${state.prdFilePath === "" ? "UNAVAILABLE" : state.prdFilePath}`,
      `- partial_prd: ${state.partialPrd ? "true" : "false"}`,
      state.prdSummary === "" ? "UNAVAILABLE" : state.prdSummary,
      "",
      `diff_cap_metrics: ${cappedDiff.metrics}`
    );
  }

  if (state.phase === "IMPLEMENT" || state.phase === "DIAGNOSE") {
    if (state.outputMode === "CHAT") {
      promptLines.push(
        "",
        "구현 모드(CHAT):",
        "- 변경 요약 중심이 아니라 PRD 요구사항을 구현 체크리스트로 정규화하세요.",
        "- repo 근거로 어디를 어떻게 바꿀지 설계안을 제시하세요.",
        "- 불명확 항목은 최대 1~3개만 질문하세요.",
        "- agent_prompt_md는 생성하지 마세요."
      );
    } else {
      promptLines.push(
        "",
        "구현 모드(COMPILE):",
        "- Codex/Gemini에 전달 가능한 구현 지시를 염두에 두고 분석하세요.",
        "- 변경 파일 후보, 구현 순서, 테스트/검증 순서를 구체화하세요."
      );
    }
    promptLines.push("", REPORT_RULES_SUFFIX);
  }

  const assembledPrompt = promptLines.join("\n");

  return { assembledPrompt, diffCapMetrics: state.scanExecuted ? capDiffForPrompt(state.repoContextBundle.diff).metrics : "lines=0 chars=0 sections=0 capped=false" };
}

async function actNode(
  state: GraphState,
  llm: LLMClient,
  hooks?: GraphHooks
): Promise<Partial<GraphState>> {
  try {
    hooks?.onBeforeAct?.(state);
    const actPrompt =
      state.scanExecuted && state.phase !== "CHAT"
        ? [
            state.assembledPrompt,
            "",
            "[FINALIZED FACTS]",
            renderFactsMd(
              state.repoContextBundle,
              state.repoPath,
              state.prdSummary,
              state.prdId,
              state.prdFilePath
            ),
            "",
          ].join("\n")
        : state.assembledPrompt;
    if (process.env.DEBUG_PROMPT === "1") {
      console.log("----- assembledPrompt (head) -----");
      console.log(actPrompt.slice(0, 6000));
    }
    const rawOutput = await llm.generate(actPrompt);
    return {
      actOutput: rawOutput,
      validateError: "",
      supervisorOutput: {
        ...state.supervisorOutput,
        status: "REVIEW_OK",
      },
    };
  } catch (error) {
    const factsMd = state.scanExecuted
      ? renderFactsMd(
          state.repoContextBundle,
          state.repoPath,
          state.prdSummary,
          state.prdId,
          state.prdFilePath
        )
      : "";
    const title = isAbortError(error) ? "LLM_TIMEOUT" : "LLM_ERROR";
    const evidence = isAbortError(error)
      ? "AbortError"
      : error instanceof Error
      ? error.message
      : String(error);
    const timeoutOutput = makeLlmTimeoutNeedContextOutput(
      factsMd,
      title,
      evidence
    );
    return {
      actOutput: timeoutOutput.reportMd,
      outputs: timeoutOutput.outputs,
      supervisorOutput: timeoutOutput.supervisorOutput,
      validateError: title,
    };
  }
}

async function validateOutputNode(state: GraphState): Promise<Partial<GraphState>> {
  if (state.supervisorOutput.status === "NEED_CONTEXT") {
    return { retryPrompt: "", validateError: "" };
  }

  if (state.phase === "CHAT") {
    const chatOutputs = parseChannelOutput(state.actOutput, state.phase, state.userInput);
    const reportMd = renderOutputsMd(chatOutputs);
    return {
      outputs: chatOutputs,
      retryPrompt: "",
      validateError: "",
      supervisorOutput: {
        status: "REVIEW_OK",
        facts_md: "",
        analysis_md: reportMd,
        report_md: reportMd,
        issues: [],
      },
    };
  }

  const validation = validateLlmOutput(state.actOutput);
  if (!validation.ok && state.retryCount < 1) {
    return {
      retryPrompt: buildImplementRetryPrompt(state, validation.reason ?? "unknown"),
      validateError: validation.reason ?? "validation failed",
    };
  }

  if (!validation.ok) {
    return {
      validateError: validation.reason ?? "validation failed",
    };
  }

  const outputs = parseChannelOutput(state.actOutput, state.phase, state.userInput);
  outputs.agent_prompt_md = buildCompileAgentPrompt(state, outputs);
  const outputsMd = renderOutputsMd(outputs);
  const factsMd = state.scanExecuted
    ? renderFactsMd(
        state.repoContextBundle,
        state.repoPath,
        state.prdSummary,
        state.prdId,
        state.prdFilePath
      )
    : "";
  const reportMd = factsMd.trim() === "" ? outputsMd : `${factsMd}\n\n${outputsMd}`;
  return {
    outputs,
    retryPrompt: "",
    validateError: "",
    supervisorOutput: {
      status: "REVIEW_OK",
      facts_md: factsMd,
      analysis_md: outputsMd,
      report_md: reportMd,
      issues: [],
    },
  };
}

async function retryOnceNode(state: GraphState, llm: LLMClient): Promise<Partial<GraphState>> {
  if (state.retryPrompt.trim() === "") {
    return { validateError: state.validateError || "retry prompt missing" };
  }
  try {
    const retryRaw = await llm.generate(state.retryPrompt);
    return {
      actOutput: retryRaw,
      retryCount: state.retryCount + 1,
      retryPrompt: "",
    };
  } catch (error) {
    const title = isAbortError(error) ? "LLM_TIMEOUT" : "LLM_ERROR";
    const factsMd = state.scanExecuted
      ? renderFactsMd(
          state.repoContextBundle,
          state.repoPath,
          state.prdSummary,
          state.prdId,
          state.prdFilePath
        )
      : "";
    const timeoutOutput = makeLlmTimeoutNeedContextOutput(
      factsMd,
      title,
      isAbortError(error) ? "AbortError" : error instanceof Error ? error.message : String(error)
    );
    return {
      actOutput: timeoutOutput.reportMd,
      outputs: timeoutOutput.outputs,
      supervisorOutput: timeoutOutput.supervisorOutput,
      retryPrompt: "",
      validateError: title,
      retryCount: state.retryCount + 1,
    };
  }
}

async function fallbackGenerateNode(state: GraphState): Promise<Partial<GraphState>> {
  const outputs = fallbackOutput(state);
  outputs.agent_prompt_md = buildCompileAgentPrompt(state, outputs);
  const outputsMd = renderOutputsMd(outputs);
  const factsMd = state.scanExecuted
    ? renderFactsMd(
        state.repoContextBundle,
        state.repoPath,
        state.prdSummary,
        state.prdId,
        state.prdFilePath
      )
    : "";
  const reportMd = factsMd.trim() === "" ? outputsMd : `${factsMd}\n\n${outputsMd}`;

  return {
    outputs,
    retryPrompt: "",
    supervisorOutput: {
      status: "REVIEW_OK",
      facts_md: factsMd,
      analysis_md: outputsMd,
      report_md: reportMd,
      issues: [
        {
          severity: "low",
          title: "LLM_FORMAT_FALLBACK",
          evidence: state.validateError || "retry validation failed",
          recommendation: "LLM 템플릿을 재점검하고 필요 시 prompt를 더 단순화하세요.",
        },
      ],
    },
  };
}

async function conflictGateNode(state: GraphState): Promise<Partial<GraphState>> {
  if (state.preflightNeedContext) {
    return {
      supervisorOutput: {
        status: "NEED_CONTEXT",
        facts_md: state.supervisorOutput.facts_md,
        analysis_md: state.supervisorOutput.analysis_md,
        report_md: state.supervisorOutput.report_md,
        issues: [...state.preflightIssues, ...(state.supervisorOutput.issues ?? [])],
        required_context: state.preflightRequiredContext,
      },
      conflictDetected: true,
    };
  }

  if (state.supervisorOutput.status === "NEED_CONTEXT") {
    return {
      conflictDetected: true,
    };
  }

  const evaluated = evaluateSupervisorOutput(state);
  const nextOutput: SupervisorOutput = {
    status: evaluated.status,
    facts_md: state.supervisorOutput.facts_md,
    analysis_md: state.supervisorOutput.analysis_md,
    report_md: state.supervisorOutput.report_md,
    issues: evaluated.issues,
    required_context: evaluated.required_context,
  };

  return {
    supervisorOutput: nextOutput,
    conflictDetected: nextOutput.status !== "REVIEW_OK",
  };
}

async function consolidateNode(
  state: GraphState,
  repo: MemoryRepository
): Promise<Partial<GraphState>> {
  if (state.conflictDetected) {
    return state;
  }

  const now = Date.now();
  const latestState = await repo.getLatestState(state.projectId);
  const summary = state.supervisorOutput.report_md;

  if (latestState) {
    await repo.update({
      ...latestState,
      summary,
      content: {
        userInput: state.userInput,
        assembledPrompt: state.assembledPrompt,
        actOutput: state.actOutput,
        supervisorOutput: state.supervisorOutput,
        conflictDetected: state.conflictDetected,
      },
      updatedAt: now,
    });
  } else {
    await repo.save({
      id: `state-${state.projectId}`,
      projectId: state.projectId,
      type: "state",
      title: "Supervisor State",
      summary,
      content: {
        userInput: state.userInput,
        assembledPrompt: state.assembledPrompt,
        actOutput: state.actOutput,
        supervisorOutput: state.supervisorOutput,
        conflictDetected: state.conflictDetected,
      },
      tags: ["graph-state"],
      importance: 5,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  return state;
}

export function buildGraph(repo: MemoryRepository, llm: LLMClient, hooks?: GraphHooks) {
  const graph = new StateGraph(GraphStateAnnotation)
    .addNode("entry", (state: GraphState) => entryNode(state))
    .addNode("phase_prd_draft", () => phasePrdDraftNode())
    .addNode("phase_implement", () => phaseImplementNode())
    .addNode("phase_diagnose", () => phaseDiagnoseNode())
    .addNode("phase_chat", () => phaseChatNode())
    .addNode("recall", (state: GraphState) => recallNode(state, repo))
    .addNode("repo_scan", (state: GraphState) => repoScanNode(state))
    .addNode("prd_load", (state: GraphState) => prdLoadNode(state))
    .addNode("assemble", (state: GraphState) => assembleNode(state))
    .addNode("act", (state: GraphState) => actNode(state, llm, hooks))
    .addNode("validate_output", (state: GraphState) => validateOutputNode(state))
    .addNode("retry_once", (state: GraphState) => retryOnceNode(state, llm))
    .addNode("fallback_generate", (state: GraphState) => fallbackGenerateNode(state))
    .addNode("conflict", (state: GraphState) => conflictGateNode(state))
    .addNode("consolidate", (state: GraphState) => consolidateNode(state, repo));

  graph.setEntryPoint("entry");
  graph.addConditionalEdges(
    "entry",
    (state: GraphState) => {
      if (state.phase === "PRD_DRAFT") return "phase_prd_draft";
      if (state.phase === "IMPLEMENT") return "phase_implement";
      if (state.phase === "DIAGNOSE") return "phase_diagnose";
      return "phase_chat";
    },
    {
      phase_prd_draft: "phase_prd_draft",
      phase_implement: "phase_implement",
      phase_diagnose: "phase_diagnose",
      phase_chat: "phase_chat",
    }
  );
  graph.addEdge("phase_prd_draft", "recall");
  graph.addEdge("phase_implement", "recall");
  graph.addEdge("phase_diagnose", "recall");
  graph.addEdge("phase_chat", "recall");

  graph.addConditionalEdges(
    "recall",
    (state: GraphState) => (shouldRunRepoScan(state.phase) ? "repo_scan" : "assemble"),
    { repo_scan: "repo_scan", assemble: "assemble" }
  );
  graph.addEdge("repo_scan", "prd_load");
  graph.addEdge("prd_load", "assemble");
  graph.addEdge("assemble", "act");
  graph.addEdge("act", "validate_output");
  graph.addConditionalEdges(
    "validate_output",
    (state: GraphState) => {
      if (state.supervisorOutput.status === "NEED_CONTEXT") return "conflict";
      if (state.retryPrompt.trim() !== "") return "retry_once";
      if (state.validateError.trim() !== "") return "fallback_generate";
      return "conflict";
    },
    {
      retry_once: "retry_once",
      fallback_generate: "fallback_generate",
      conflict: "conflict",
    }
  );
  graph.addEdge("retry_once", "validate_output");
  graph.addEdge("fallback_generate", "conflict");

  graph.addConditionalEdges(
    "conflict",
    (state: GraphState) => (state.conflictDetected ? "end" : "consolidate"),
    { end: END, consolidate: "consolidate" }
  );

  graph.addEdge("consolidate", END);

  return graph.compile();
}

export async function runGraph(
  repo: MemoryRepository,
  llm: LLMClient,
  input: string,
  projectId: string,
  repoPath: string = process.cwd(),
  phase: SupervisorPhase = "CHAT",
  outputMode: OutputMode = "CHAT"
): Promise<string> {
  const app = buildGraph(repo, llm);

  const initialState: GraphState = {
    userInput: input,
    projectId,
    phase: normalizePhase(phase),
    outputMode: normalizeOutputMode(outputMode, input),
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
  if (result.conflictDetected) {
    return "CONFIRMATION REQUIRED";
  }

  return renderOutputsMd(result.outputs);
}
