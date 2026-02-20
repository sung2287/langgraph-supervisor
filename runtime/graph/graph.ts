import { Annotation, END, StateGraph } from "@langchain/langgraph";
import { executePlan } from "../../src/core/plan/plan.executor";
import type {
  ExecutionPlan as CoreExecutionPlan,
  GraphState as CoreGraphState,
  PlanExecutorDeps,
  PolicyRef,
  Step as CoreStep,
} from "../../src/core/plan/plan.types";
import type { StepExecutorRegistry } from "../../src/core/plan/step.registry";
import type {
  ExecutionPlan as PolicyExecutionPlan,
  ExecutionStep as PolicyExecutionStep,
} from "../../src/policy/schema/policy.types";

export type GraphState = CoreGraphState;

export interface GraphDeps {
  readonly planExecutorDeps: PlanExecutorDeps;
  readonly stepExecutorRegistry: StepExecutorRegistry;
}

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
  stepResults: Annotation<Readonly<Record<string, unknown>> | undefined>,
  stepUnavailableReasons: Annotation<Readonly<Record<string, string>> | undefined>,
  repoScanVersion: Annotation<string | undefined>,
  repoContextArtifactPath: Annotation<string | undefined>,
  repoContextUnavailableReason: Annotation<string | undefined>,
  lastResponse: Annotation<string | undefined>,
  stepLog: Annotation<string[]>,
});

function normalizePolicyStep(step: PolicyExecutionStep): CoreStep {
  const raw = step as Record<string, unknown>;
  const paramsRaw = raw.params;
  const params =
    typeof paramsRaw === "object" && paramsRaw !== null && !Array.isArray(paramsRaw)
      ? { ...(paramsRaw as Record<string, unknown>) }
      : {};

  if (typeof raw.kind === "string" && raw.kind.trim() !== "") {
    return {
      kind: raw.kind,
      params,
    };
  }

  if (typeof raw.type === "string" && raw.type.trim() !== "") {
    return {
      kind: raw.type,
      params,
    };
  }

  throw new Error("PLAN_NORMALIZATION_ERROR step requires non-empty kind or type");
}

export function toCoreExecutionPlan(plan: PolicyExecutionPlan): CoreExecutionPlan {
  return {
    version: plan.version,
    steps: plan.steps.map((step) => normalizePolicyStep(step)),
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
  const initialState: GraphState = {
    userInput: input.userInput,
    executionPlan: input.executionPlan,
    policyRef: input.policyRef,
    currentMode: input.currentMode,
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
