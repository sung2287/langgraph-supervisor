import { Annotation, END, StateGraph } from "@langchain/langgraph";
import { executePlan } from "../../src/core/plan/plan.executor";
import type {
  ExecutionPlan as CoreExecutionPlan,
  ExecutionPlanV1 as CoreExecutionPlanV1,
  GraphState as CoreGraphState,
  PlanExecutorDeps,
  PolicyRef,
} from "../../src/core/plan/plan.types";
import type { StepExecutorRegistry } from "../../src/core/plan/step.registry";
import type { NormalizedExecutionPlan } from "../../src/policy/schema/policy.types";

export type GraphState = CoreGraphState;

export interface GraphDeps {
  readonly planExecutorDeps: PlanExecutorDeps;
  readonly stepExecutorRegistry: StepExecutorRegistry;
}

export interface RunGraphInput {
  userInput: string;
  executionPlan: CoreExecutionPlan;
  policyRef: PolicyRef;
  projectId?: string;
  currentMode?: string;
  currentDomain?: string;
}

export const GraphStateAnnotation = Annotation.Root({
  userInput: Annotation<string>,
  executionPlan: Annotation<CoreExecutionPlan>,
  policyRef: Annotation<PolicyRef>,
  projectId: Annotation<string | undefined>,
  currentMode: Annotation<string | undefined>,
  currentDomain: Annotation<string | undefined>,
  loadedDocs: Annotation<readonly string[] | undefined>,
  selectedContext: Annotation<string | undefined>,
  assembledPrompt: Annotation<string | undefined>,
  actOutput: Annotation<unknown>,
  stepResults: Annotation<Readonly<Record<string, unknown>> | undefined>,
  stepUnavailableReasons: Annotation<Readonly<Record<string, string>> | undefined>,
  repoScanVersion: Annotation<string | undefined>,
  repoContextArtifactPath: Annotation<string | undefined>,
  repoContextUnavailableReason: Annotation<string | undefined>,
  lastResponse: Annotation<string | undefined>,
  stepLog: Annotation<string[]>,
});

export function toCoreExecutionPlan(plan: NormalizedExecutionPlan): CoreExecutionPlan {
  const mode = plan.metadata.mode;
  if (typeof mode !== "string" || mode.trim() === "") {
    throw new Error("PLAN_NORMALIZATION_ERROR metadata.mode must be provided");
  }
  const policyProfile = plan.metadata.policyProfile;
  if (typeof policyProfile !== "string" || policyProfile.trim() === "") {
    throw new Error("PLAN_NORMALIZATION_ERROR metadata.policyProfile must be provided");
  }

  const metadata: CoreExecutionPlanV1["metadata"] =
    typeof plan.metadata.topK === "number"
      ? {
        policyProfile,
        mode,
        topK: plan.metadata.topK,
      }
      : {
        policyProfile,
        mode,
      };

  return {
    step_contract_version: plan.step_contract_version,
    extensions: [],
    metadata,
    steps: plan.steps.map((step) => ({
      id: step.id,
      type: step.type,
      payload: step.payload ?? {},
    })),
  };
}

export function toPolicyRef(
  plan: NormalizedExecutionPlan,
  docBundleRefs: readonly string[] = []
): PolicyRef {
  return Object.freeze({
    policyId: plan.metadata.policyProfile,
    modeLabel: plan.metadata.mode,
    docBundleRefs: [...docBundleRefs],
  });
}

export function buildGraph(deps: GraphDeps) {
  const graph = new StateGraph(GraphStateAnnotation).addNode(
    "execute_plan",
    async (state: GraphState): Promise<GraphState> => {
      return executePlan(
        state.executionPlan,
        state,
        deps.planExecutorDeps,
        deps.stepExecutorRegistry
      );
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
  const initialState = {
    userInput: input.userInput,
    executionPlan: input.executionPlan,
    policyRef: input.policyRef,
    projectId: input.projectId,
    currentMode: input.currentMode,
    currentDomain: input.currentDomain,
    loadedDocs: undefined,
    selectedContext: undefined,
    assembledPrompt: undefined,
    actOutput: undefined,
    stepResults: undefined,
    stepUnavailableReasons: undefined,
    repoScanVersion: undefined,
    repoContextArtifactPath: undefined,
    repoContextUnavailableReason: undefined,
    lastResponse: undefined,
    stepLog: [],
  };
  return app.invoke(initialState);
}
