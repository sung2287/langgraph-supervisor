import { Annotation, END, StateGraph } from "@langchain/langgraph";
import { executePlan } from "../../src/core/plan/plan.executor";
import type {
  ExecutionPlan as CoreExecutionPlan,
  GraphState as CoreGraphState,
  PlanExecutorDeps,
  PolicyRef,
  StepDefinition,
  StepType,
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

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const POLICY_TO_STEP_TYPE: Readonly<Record<string, StepType>> = Object.freeze({
  RepoScan: "RepoScan",
  repo_scan: "RepoScan",
  repo_context: "RepoScan",
  LoadDocsForMode: "RepoScan",
  ContextSelect: "ContextSelect",
  context_select: "ContextSelect",
  RetrieveMemory: "RetrieveMemory",
  retrieve_memory: "RetrieveMemory",
  recall: "ContextSelect",
  RetrieveDecisionContext: "RetrieveDecisionContext",
  retrieve_decision_context: "RetrieveDecisionContext",
  PromptAssemble: "PromptAssemble",
  assemble_prompt: "PromptAssemble",
  LLMCall: "LLMCall",
  llm_call: "LLMCall",
  SummarizeMemory: "SummarizeMemory",
  summarize_memory: "SummarizeMemory",
  PersistMemory: "PersistMemory",
  persist_memory: "PersistMemory",
  MemoryWrite: "PersistMemory",
  memory_write: "PersistMemory",
  PersistDecision: "PersistDecision",
  persist_decision: "PersistDecision",
  PersistEvidence: "PersistEvidence",
  persist_evidence: "PersistEvidence",
  LinkDecisionEvidence: "LinkDecisionEvidence",
  link_decision_evidence: "LinkDecisionEvidence",
  PersistSession: "PersistSession",
  persist_session: "PersistSession",
});

const V11_ONLY_STEP_TYPES = new Set<StepType>([
  "RetrieveDecisionContext",
  "PersistDecision",
  "PersistEvidence",
  "LinkDecisionEvidence",
]);

function mapPolicyStepType(rawType: string): StepType {
  const normalized = rawType.trim();
  const mapped = POLICY_TO_STEP_TYPE[normalized];
  if (mapped) {
    return mapped;
  }
  throw new Error(`PLAN_NORMALIZATION_ERROR unsupported step type '${normalized}'`);
}

function normalizePolicyStep(step: PolicyExecutionStep, idx: number): StepDefinition {
  const raw = step as Record<string, unknown>;
  const paramsRaw = raw.params;
  const payload =
    typeof paramsRaw === "object" && paramsRaw !== null && !Array.isArray(paramsRaw)
      ? { ...(paramsRaw as Record<string, unknown>) }
      : {};

  const rawKind =
    typeof raw.kind === "string" && raw.kind.trim() !== ""
      ? raw.kind
      : typeof raw.type === "string" && raw.type.trim() !== ""
        ? raw.type
        : "";
  if (rawKind === "") {
    throw new Error("PLAN_NORMALIZATION_ERROR step requires non-empty kind or type");
  }

  return {
    id: typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id : `step-${String(idx + 1)}`,
    type: mapPolicyStepType(rawKind),
    payload,
  };
}

export function toCoreExecutionPlan(plan: PolicyExecutionPlan): CoreExecutionPlan {
  const mode = plan.metadata.modeLabel;
  if (typeof mode !== "string" || mode.trim() === "") {
    throw new Error("PLAN_NORMALIZATION_ERROR metadata.modeLabel must be provided");
  }

  const normalizedSteps = plan.steps.map((step, idx) => normalizePolicyStep(step, idx));
  const retrieveMemoryStep = normalizedSteps.find((step) => step.type === "RetrieveMemory");
  const retrievePayload = retrieveMemoryStep ? asRecord(retrieveMemoryStep.payload) : {};
  const topKCandidate = retrievePayload.topK;
  const stepContractVersion = normalizedSteps.some((step) => V11_ONLY_STEP_TYPES.has(step.type))
    ? "1.1"
    : "1";

  return {
    step_contract_version: stepContractVersion,
    extensions: [],
    metadata: {
      topK:
        typeof topKCandidate === "number" && Number.isFinite(topKCandidate)
          ? topKCandidate
          : undefined,
      policyProfile: plan.metadata.policyId,
      mode,
    },
    steps: normalizedSteps,
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
  const initialState = {
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
