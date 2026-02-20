import type {
  GraphState,
  PlanExecutorDeps,
  PolicyRef,
  Step,
} from "./plan.types";
import type { StatePatch, StepHandler, StepHandlerRegistry } from "./step.registry";

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

const loadDocsForMode: StepHandler = async (
  state: Readonly<GraphState>,
  _step: Step,
  deps: PlanExecutorDeps
): Promise<StatePatch> => {
  const loadedDocs = deps.loadDocsForMode
    ? await deps.loadDocsForMode(state.policyRef)
    : getDocBundleRefs(state.policyRef);

  return {
    loadedDocs,
    actOutput: loadedDocs,
  };
};

const contextSelect: StepHandler = async (
  state: Readonly<GraphState>,
  _step: Step,
  deps: PlanExecutorDeps
): Promise<StatePatch> => {
  const loadedDocs = state.loadedDocs ?? [];
  const selectedContext = deps.selectContext
    ? await deps.selectContext({
        userInput: state.userInput,
        loadedDocs,
        policyRef: state.policyRef,
      })
    : loadedDocs.join("\n");

  return {
    selectedContext,
    actOutput: selectedContext,
  };
};

const promptAssemble: StepHandler = (
  state: Readonly<GraphState>,
  _step: Step,
  deps: PlanExecutorDeps
): StatePatch => {
  const loadedDocs = state.loadedDocs ?? [];
  const assembledPrompt = deps.assemblePrompt
    ? deps.assemblePrompt({
        userInput: state.userInput,
        selectedContext: state.selectedContext,
        loadedDocs,
        policyRef: state.policyRef,
      })
    : buildPrompt(state);

  return {
    assembledPrompt,
    actOutput: assembledPrompt,
  };
};

const llmCall: StepHandler = async (
  state: Readonly<GraphState>,
  _step: Step,
  deps: PlanExecutorDeps
): Promise<StatePatch> => {
  const prompt = state.assembledPrompt ?? state.userInput;
  const lastResponse = await deps.llmClient.generate(prompt);

  return {
    lastResponse,
    actOutput: lastResponse,
  };
};

const memoryWrite: StepHandler = async (
  state: Readonly<GraphState>,
  _step: Step,
  deps: PlanExecutorDeps
): Promise<StatePatch> => {
  await deps.memoryRepo.write({
    userInput: state.userInput,
    assembledPrompt: state.assembledPrompt,
    lastResponse: state.lastResponse,
    policyRef: state.policyRef,
  });

  return {
    actOutput: state.lastResponse,
  };
};

export function createBuiltinHandlers(): StepHandlerRegistry {
  return {
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
}
