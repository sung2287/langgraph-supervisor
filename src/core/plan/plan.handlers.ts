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
  _step: Step,
  deps: PlanExecutorDeps
): Promise<StepExecutionResult> => {
  const loadedDocs = state.loadedDocs ?? [];
  const selectedContext = deps.selectContext
    ? await deps.selectContext({
        userInput: state.userInput,
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

export const coreStepExecutors: Readonly<Record<string, StepExecutor>> = {
  LoadDocsForMode: loadDocsForMode,
  ContextSelect: contextSelect,
  PromptAssemble: promptAssemble,
  LLMCall: llmCall,
  MemoryWrite: memoryWrite,
  recall: contextSelect,
  repo_scan: loadDocsForMode,
  assemble_prompt: promptAssemble,
  llm_call: llmCall,
  memory_write: memoryWrite,
};
