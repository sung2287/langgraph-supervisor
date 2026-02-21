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
  const loadedDocs = asStringArray(payload.sources);
  const sources = loadedDocs.length > 0 ? loadedDocs : [...(state.loadedDocs ?? [])];
  const userInput =
    typeof payload.input === "string" && payload.input.trim() !== ""
      ? payload.input
      : state.userInput;
  const selectedContext = deps.selectContext
    ? await deps.selectContext({
        userInput,
        loadedDocs: sources,
        stepResults: state.stepResults,
        policyRef: state.policyRef,
      })
    : sources.join("\n");

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

const retrieveMemory: StepExecutor = (
  _state: Readonly<GraphState>,
  step: Step
): StepExecutionResult => {
  const payload = readStepPayload(step);
  const topK = payload.topK;
  if (typeof topK !== "number" || !Number.isFinite(topK) || topK < 0) {
    return {
      kind: "error",
      error: {
        message: "RetrieveMemory payload.topK must be a non-negative number",
      },
    };
  }

  const items: Array<{ id: string; summary: string; timestamp: number | string }> = [];
  const boundedItems = items.slice(0, Math.floor(topK));

  return okResult({ items: boundedItems }, { actOutput: { items: boundedItems } });
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
  const normalized = response.trim();
  const summary = normalized === "" ? "" : normalized.slice(0, 256);
  const keywords = Array.from(
    new Set(
      summary
        .split(/\s+/)
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0)
    )
  ).slice(0, 16);

  return okResult(
    {
      summary,
      keywords,
    },
    {
      actOutput: {
        summary,
        keywords,
      },
    }
  );
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

const persistSession: StepExecutor = (
  state: Readonly<GraphState>
): StepExecutionResult => {
  const status = "persisted";
  return okResult(
    {
      status,
    },
    {
      actOutput: {
        status,
        sessionRef:
          typeof (state.policyRef as { sessionRef?: unknown }).sessionRef === "string"
            ? (state.policyRef as { sessionRef: string }).sessionRef
            : undefined,
      },
    }
  );
};

export const coreStepExecutors: Readonly<Record<string, StepExecutor>> = {
  RepoScan: loadDocsForMode,
  ContextSelect: contextSelect,
  RetrieveMemory: retrieveMemory,
  PromptAssemble: promptAssemble,
  LLMCall: llmCall,
  SummarizeMemory: summarizeMemory,
  PersistMemory: memoryWrite,
  PersistSession: persistSession,
  LoadDocsForMode: loadDocsForMode,
  MemoryWrite: memoryWrite,
  repo_scan: loadDocsForMode,
  assemble_prompt: promptAssemble,
  llm_call: llmCall,
  memory_write: memoryWrite,
};
