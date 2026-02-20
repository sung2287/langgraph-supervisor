import { Annotation, END, StateGraph } from "@langchain/langgraph";
import { executePlan } from "../../src/core/plan/plan.executor";
import type {
  ExecutionPlan as CoreExecutionPlan,
  GraphState as CoreGraphState,
  PlanExecutorDeps,
  PolicyRef,
} from "../../src/core/plan/plan.types";
import type { ExecutionPlan as PolicyExecutionPlan } from "../../src/policy/schema/policy.types";

export type GraphState = CoreGraphState;
export type GraphDeps = PlanExecutorDeps;

export interface RunGraphInput {
  userInput: string;
  executionPlan: CoreExecutionPlan;
  policyRef: PolicyRef;
  currentMode?: string;
}

export const GraphStateAnnotation = Annotation.Root({
  userInput: Annotation<string>,
  executionPlan: Annotation<CoreExecutionPlan>,
  policyRef: Annotation<PolicyRef>,
  currentMode: Annotation<string | undefined>,
  loadedDocs: Annotation<readonly string[] | undefined>,
  selectedContext: Annotation<string | undefined>,
  assembledPrompt: Annotation<string | undefined>,
  actOutput: Annotation<unknown>,
  lastResponse: Annotation<string | undefined>,
  stepLog: Annotation<string[]>,
});

export function toCoreExecutionPlan(plan: PolicyExecutionPlan): CoreExecutionPlan {
  return {
    version: plan.version,
    steps: plan.steps.map((step) => ({
      type: step.type,
      params: { ...step.params },
    })),
  };
}

export function toPolicyRef(
  plan: PolicyExecutionPlan,
  docBundleRefs: readonly string[] = []
): PolicyRef {
  return Object.freeze({
    policyId: plan.metadata.policyId,
    modeLabel: plan.metadata.modeLabel,
    docBundleRefs: [...docBundleRefs],
  });
}

export function buildGraph(deps: GraphDeps) {
  const graph = new StateGraph(GraphStateAnnotation).addNode(
    "execute_plan",
    async (state: GraphState): Promise<GraphState> => {
      return executePlan(state, deps);
    }
  );

  graph.setEntryPoint("execute_plan");
  graph.addEdge("execute_plan", END);

  return graph.compile();
}

export async function runGraph(
  input: RunGraphInput,
  deps: GraphDeps
): Promise<GraphState> {
  const app = buildGraph(deps);
  const initialState: GraphState = {
    userInput: input.userInput,
    executionPlan: input.executionPlan,
    policyRef: input.policyRef,
    currentMode: input.currentMode,
    loadedDocs: undefined,
    selectedContext: undefined,
    assembledPrompt: undefined,
    actOutput: undefined,
    lastResponse: undefined,
    stepLog: [],
  };
  return app.invoke(initialState);
}
