import type {
  GraphState,
  PlanExecutorDeps,
  PolicyRef,
  Step,
} from "./plan.types";
import type { StatePatch, StepExecutionResult, StepExecutor } from "./step.registry";

function okResult(data?: unknown, patch?: StatePatch): StepExecutionResult {
  return {
    kind: "ok",
    data,
    patch,
  };
}

function errorResult(message: string): StepExecutionResult {
  return {
    kind: "error",
    error: { message },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readStepPayload(step: Step): Record<string, unknown> {
  if ("payload" in step) {
    return asRecord(step.payload);
  }
  return asRecord(step.params);
}

function getDocBundleRefs(policyRef: PolicyRef): readonly string[] {
  const raw = (policyRef as { docBundleRefs?: unknown }).docBundleRefs;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((item): item is string => typeof item === "string");
}

function buildPrompt(state: GraphState): string {
  const sections = [`UserInput:\n${state.userInput}`];

  if (state.selectedContext && state.selectedContext.trim() !== "") {
    sections.push(`Context:\n${state.selectedContext}`);
  }

  if (state.loadedDocs && state.loadedDocs.length > 0) {
    sections.push(`Docs:\n${state.loadedDocs.join("\n")}`);
  }

  return sections.join("\n\n");
}

const loadDocsForMode: StepExecutor = async (
  state: Readonly<GraphState>,
  _step: Step,
  deps: PlanExecutorDeps
): Promise<StepExecutionResult> => {
  const loadedDocs = deps.loadDocsForMode
    ? await deps.loadDocsForMode(state.policyRef)
    : getDocBundleRefs(state.policyRef);

  return okResult(loadedDocs, {
    loadedDocs,
    actOutput: loadedDocs,
  });
};

const contextSelect: StepExecutor = async (
  state: Readonly<GraphState>,
  step: Step,
  deps: PlanExecutorDeps
): Promise<StepExecutionResult> => {
  const payload = readStepPayload(step);
  const payloadSources = asStringArray(payload.sources);
  const loadedDocs = payloadSources.length > 0 ? payloadSources : [...(state.loadedDocs ?? [])];
  const userInput =
    typeof payload.input === "string" && payload.input.trim() !== ""
      ? payload.input
      : state.userInput;

  const selectedContext = deps.selectContext
    ? await deps.selectContext({
        userInput,
        loadedDocs,
        stepResults: state.stepResults,
        policyRef: state.policyRef,
      })
    : loadedDocs.join("\n");

  return okResult(selectedContext, {
    selectedContext,
    actOutput: selectedContext,
  });
};

const retrieveMemory: StepExecutor = (
  _state: Readonly<GraphState>,
  step: Step
): StepExecutionResult => {
  const payload = readStepPayload(step);
  const topK = payload.topK;
  if (typeof topK !== "number" || !Number.isFinite(topK) || topK < 0) {
    return errorResult("RetrieveMemory payload.topK must be a non-negative number");
  }

  const items: Array<{ id: string; summary: string; timestamp: number | string }> = [];
  return okResult({ items: items.slice(0, Math.floor(topK)) });
};

const retrieveDecisionContext: StepExecutor = (): StepExecutionResult => {
  return errorResult("NOT_IMPLEMENTED_PRD005");
};

const promptAssemble: StepExecutor = (
  state: Readonly<GraphState>,
  _step: Step,
  deps: PlanExecutorDeps
): StepExecutionResult => {
  const loadedDocs = state.loadedDocs ?? [];
  const assembledPrompt = deps.assemblePrompt
    ? deps.assemblePrompt({
        userInput: state.userInput,
        selectedContext: state.selectedContext,
        loadedDocs,
        stepResults: state.stepResults,
        policyRef: state.policyRef,
      })
    : buildPrompt(state);

  return okResult(assembledPrompt, {
    assembledPrompt,
    actOutput: assembledPrompt,
  });
};

const llmCall: StepExecutor = async (
  state: Readonly<GraphState>,
  _step: Step,
  deps: PlanExecutorDeps
): Promise<StepExecutionResult> => {
  const prompt = state.assembledPrompt ?? state.userInput;
  const lastResponse = await deps.llmClient.generate(prompt);

  return okResult(lastResponse, {
    lastResponse,
    actOutput: lastResponse,
  });
};

const summarizeMemory: StepExecutor = (
  state: Readonly<GraphState>,
  step: Step
): StepExecutionResult => {
  const payload = readStepPayload(step);
  const response =
    typeof payload.response === "string" && payload.response.trim() !== ""
      ? payload.response
      : state.lastResponse ?? "";
  const summary = response.trim();
  const keywords = summary === "" ? [] : summary.split(/\s+/).slice(0, 16);

  return okResult({ summary, keywords }, { actOutput: { summary, keywords } });
};

const memoryWrite: StepExecutor = async (
  state: Readonly<GraphState>,
  _step: Step,
  deps: PlanExecutorDeps
): Promise<StepExecutionResult> => {
  await deps.memoryRepo.write({
    userInput: state.userInput,
    assembledPrompt: state.assembledPrompt,
    lastResponse: state.lastResponse,
    policyRef: state.policyRef,
  });

  return okResult(state.lastResponse, {
    actOutput: state.lastResponse,
  });
};

const persistDecision: StepExecutor = (): StepExecutionResult => {
  return errorResult("NOT_IMPLEMENTED_PRD005");
};

const persistEvidence: StepExecutor = (): StepExecutionResult => {
  return errorResult("NOT_IMPLEMENTED_PRD005");
};

const linkDecisionEvidence: StepExecutor = (): StepExecutionResult => {
  return errorResult("NOT_IMPLEMENTED_PRD005");
};

const persistSession: StepExecutor = (): StepExecutionResult => {
  return okResult({ status: "persisted" });
};

export const coreStepExecutors: Readonly<Record<string, StepExecutor>> = {
  RepoScan: loadDocsForMode,
  ContextSelect: contextSelect,
  RetrieveMemory: retrieveMemory,
  RetrieveDecisionContext: retrieveDecisionContext,
  PromptAssemble: promptAssemble,
  LLMCall: llmCall,
  SummarizeMemory: summarizeMemory,
  PersistMemory: memoryWrite,
  PersistDecision: persistDecision,
  PersistEvidence: persistEvidence,
  LinkDecisionEvidence: linkDecisionEvidence,
  PersistSession: persistSession,
  LoadDocsForMode: loadDocsForMode,
  MemoryWrite: memoryWrite,
  repo_scan: loadDocsForMode,
  assemble_prompt: promptAssemble,
  llm_call: llmCall,
  memory_write: memoryWrite,
};
