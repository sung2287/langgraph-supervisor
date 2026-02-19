import { Annotation, END, StateGraph } from "@langchain/langgraph";
import { detectConflict } from "../policy/decision-lock";
import { MemoryRepository } from "../memory/memory.repository";
import { MemoryCard } from "../memory/memory.types";
import { LLMClient } from "../llm/llm.types";

export interface GraphState {
  userInput: string;
  projectId: string;
  retrieved: MemoryCard[];
  assembledPrompt: string;
  actOutput: string;
  conflictDetected: boolean;
}

const GraphStateAnnotation = Annotation.Root({
  userInput: Annotation<string>,
  projectId: Annotation<string>,
  retrieved: Annotation<MemoryCard[]>,
  assembledPrompt: Annotation<string>,
  actOutput: Annotation<string>,
  conflictDetected: Annotation<boolean>,
});

const SUPERVISOR_PROMPT = `당신은 '코드/문서 감독관(Supervisor)' 입니다.
목표는 안전성/일관성/정책 준수 관점에서 입력을 검토하고,
필요한 수정 지시를 '제안'으로만 제공합니다.
당신은 코드를 직접 수정하지 않습니다.

절대 하지 말 것:
- 인사/자기소개/잡담
- 사용자를 다시 질문으로 돌리기(필요하면 가정하고 진행)
- decision(결정)을 자동 수정/무시하라고 제안하기
- 출력 포맷을 깨기

출력은 반드시 아래 JSON 한 덩어리로만 반환하세요(추가 텍스트 금지).

{
  "summary": "<한 문장 요약>",
  "issues": [
    { "severity": "high|mid|low", "title": "<문제명>", "evidence": "<근거>", "recommendation": "<수정 제안>" }
  ],
  "conflict_risk": "none|possible|high",
  "next_action": "<가장 우선 행동 1개>"
}`;

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

async function assembleNode(state: GraphState): Promise<Partial<GraphState>> {
  const decisions = state.retrieved.filter((card) => card.type === "decision");
  const currentStateCard = state.retrieved.find((card) => card.type === "state");

  const contextLines: string[] = [];
  if (decisions.length > 0) {
    contextLines.push(
      "DECISIONS:",
      ...decisions.map((card) => `- ${card.summary}`)
    );
  }
  if (currentStateCard) {
    contextLines.push("CURRENT_STATE:", currentStateCard.summary);
  }

  const assembledPrompt = [
    SUPERVISOR_PROMPT,
    "",
    "INPUT:",
    state.userInput,
    "",
    "CONTEXT:",
    contextLines.join("\n") || "none",
  ].join("\n");

  return { assembledPrompt };
}

async function actNode(
  state: GraphState,
  llm: LLMClient
): Promise<Partial<GraphState>> {
  state.actOutput = await llm.generate(state.assembledPrompt);
  return state;
}

async function conflictGateNode(
  state: GraphState,
  _repo: MemoryRepository
): Promise<Partial<GraphState>> {
  const decisions = state.retrieved.filter((card) => card.type === "decision");
  const conflictDetected = detectConflict(decisions, state.actOutput);
  return { conflictDetected };
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
  const summary = state.actOutput;

  if (latestState) {
    await repo.update({
      ...latestState,
      summary,
      content: {
        userInput: state.userInput,
        assembledPrompt: state.assembledPrompt,
        actOutput: state.actOutput,
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

export function buildGraph(repo: MemoryRepository, llm: LLMClient) {
  const graph = new StateGraph(GraphStateAnnotation)
    .addNode("recall", (state: GraphState) => recallNode(state, repo))
    .addNode("assemble", (state: GraphState) => assembleNode(state))
    .addNode("act", (state: GraphState) => actNode(state, llm))
    .addNode("conflict", (state: GraphState) => conflictGateNode(state, repo))
    .addNode("consolidate", (state: GraphState) => consolidateNode(state, repo));

  graph.setEntryPoint("recall");

  graph.addEdge("recall", "assemble");
  graph.addEdge("assemble", "act");
  graph.addEdge("act", "conflict");

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
  projectId: string
): Promise<string> {
  const app = buildGraph(repo, llm);

  const initialState: GraphState = {
    userInput: input,
    projectId,
    retrieved: [],
    assembledPrompt: "",
    actOutput: "",
    conflictDetected: false,
  };

  const result = await app.invoke(initialState);

  if (result.conflictDetected) {
    return "CONFIRMATION REQUIRED";
  }

  return result.actOutput;
}
