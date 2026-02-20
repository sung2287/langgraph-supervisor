import { Annotation, END, StateGraph } from "@langchain/langgraph";
import { executeExecutionPlan } from "../../src/core/plan/plan.executor";
import type {
  ExecutionPlan as CoreExecutionPlan,
  PlanExecutionContext,
} from "../../src/core/plan/plan.types";
import type { ExecutionPlan } from "../../src/policy/schema/policy.types";
import type { LLMClient } from "../llm/llm.types";

export type SupervisorPhase = "PRD_DRAFT" | "IMPLEMENT" | "DIAGNOSE" | "CHAT";

export interface GraphState {
  userInput: string;
  projectId: string;
  repoPath: string;
  phase: SupervisorPhase;
  executionPlan: ExecutionPlan;
  output: string;
  stepLog: string[];
}

export const GraphStateAnnotation = Annotation.Root({
  userInput: Annotation<string>,
  projectId: Annotation<string>,
  repoPath: Annotation<string>,
  phase: Annotation<SupervisorPhase>,
  executionPlan: Annotation<ExecutionPlan>,
  output: Annotation<string>,
  stepLog: Annotation<string[]>,
});

function toCorePlan(plan: ExecutionPlan): CoreExecutionPlan {
  return {
    version: plan.version,
    steps: plan.steps.map((step) => ({
      type: step.type,
      params: { ...step.params },
    })),
    metadata: {
      modeLabel: plan.metadata.modeLabel,
      policyId: plan.metadata.policyId,
    },
  };
}

export function buildGraph(llm: LLMClient) {
  const graph = new StateGraph(GraphStateAnnotation).addNode(
    "execute_plan",
    async (state: GraphState): Promise<GraphState> => {
      const ctx: PlanExecutionContext = {
        userInput: state.userInput,
        repoPath: state.repoPath,
        assembledPrompt: "",
        output: "",
        stepLog: [...state.stepLog],
        llmGenerate: (prompt: string) => llm.generate(prompt),
      };
      const nextCtx = await executeExecutionPlan(toCorePlan(state.executionPlan), ctx);
      return {
        ...state,
        output: nextCtx.output,
        stepLog: nextCtx.stepLog,
      };
    }
  );

  graph.setEntryPoint("execute_plan");
  graph.addEdge("execute_plan", END);

  return graph.compile();
}

export async function runGraph(
  repo: unknown,
  llm: LLMClient,
  input: string,
  projectId: string,
  repoPath: string,
  phase: SupervisorPhase,
  executionPlan: ExecutionPlan
): Promise<GraphState> {
  void repo;
  const app = buildGraph(llm);
  const initialState: GraphState = {
    userInput: input,
    projectId,
    repoPath,
    phase,
    executionPlan,
    output: "",
    stepLog: [],
  };
  return app.invoke(initialState);
}
