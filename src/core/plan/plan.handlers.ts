import type {
  GraphState,
  PlanExecutorDeps,
  PolicyRef,
  Step,
} from "./plan.types";
import type { StatePatch, StepExecutionResult, StepExecutor } from "./step.registry";
import { FailFastError } from "./errors";
import { hasForbiddenMemoryPayloadKeys } from "./memory_payload.guard";
import {
  isAllowedDecisionScope,
  normalizeDecisionScope,
} from "../decision/decision.scope";

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

function unavailableResult(reason: string): StepExecutionResult {
  return {
    kind: "unavailable",
    reason,
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

function assertScopeAllowed(scope: string, where: string): string {
  const normalized = normalizeDecisionScope(scope);
  if (!isAllowedDecisionScope(normalized)) {
    throw new FailFastError(`DECISION_SCOPE_INVALID ${where} scope='${scope}'`);
  }
  return normalized;
}

function assertOptionalScopeField(
  value: unknown,
  where: string,
  fieldName: string
): void {
  if (typeof value === "undefined" || value === null) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new FailFastError(`DECISION_SCOPE_INVALID ${where} ${fieldName} must be string`);
  }
  assertScopeAllowed(value, `${where}.${fieldName}`);
}

function assertGenericPayloadScopes(payload: Record<string, unknown>, where: string): void {
  assertOptionalScopeField(payload.scope, where, "scope");
  assertOptionalScopeField(payload.currentDomain, where, "currentDomain");
  assertOptionalScopeField(payload.decisionScope, where, "decisionScope");
  assertOptionalScopeField(payload.evidenceScope, where, "evidenceScope");
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

const retrieveDecisionContext: StepExecutor = async (
  state: Readonly<GraphState>,
  step: Step,
  deps: PlanExecutorDeps
): Promise<StepExecutionResult> => {
  const payload = readStepPayload(step);
  const input =
    typeof payload.input === "string" && payload.input.trim() !== ""
      ? payload.input
      : state.userInput;
  const currentDomainCandidate =
    typeof payload.currentDomain === "string" && payload.currentDomain.trim() !== ""
      ? payload.currentDomain
      : state.currentDomain;

  if (typeof currentDomainCandidate === "string" && currentDomainCandidate.trim() !== "") {
    assertScopeAllowed(currentDomainCandidate, "RetrieveDecisionContext");
  }

  if (!deps.retrieveDecisionContext) {
    return errorResult("NOT_IMPLEMENTED_PRD005");
  }

  const result = await deps.retrieveDecisionContext({
    input,
    currentDomain: currentDomainCandidate,
  });

  return okResult(result, { actOutput: result });
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

const summarizeMemory: StepExecutor = (): StepExecutionResult => {
  return unavailableResult("LEGACY_SUMMARIZE_MEMORY_DISABLED");
};

const memoryWrite: StepExecutor = async (
  state: Readonly<GraphState>,
  step: Step,
  deps: PlanExecutorDeps
): Promise<StepExecutionResult> => {
  const payload = readStepPayload(step);
  if (hasForbiddenMemoryPayloadKeys(payload) || hasForbiddenMemoryPayloadKeys(state.stepResults)) {
    throw new FailFastError("MEMORY_WRITE_FORBIDDEN_PAYLOAD_KEYS");
  }

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

const persistDecision: StepExecutor = async (
  _state: Readonly<GraphState>,
  step: Step,
  deps: PlanExecutorDeps
): Promise<StepExecutionResult> => {
  const payload = readStepPayload(step);
  assertGenericPayloadScopes(payload, "PersistDecision");

  const decision = asRecord(payload.decision);
  const scope = decision.scope;
  if (typeof scope !== "string" || scope.trim() === "") {
    throw new FailFastError("DECISION_SCOPE_INVALID PersistDecision.decision.scope required");
  }
  assertScopeAllowed(scope, "PersistDecision.decision.scope");

  if (!deps.persistDecision) {
    return errorResult("NOT_IMPLEMENTED_PRD005");
  }

  const result = await deps.persistDecision({ decision });
  return okResult(result, { actOutput: result });
};

const persistEvidence: StepExecutor = async (
  _state: Readonly<GraphState>,
  step: Step,
  deps: PlanExecutorDeps
): Promise<StepExecutionResult> => {
  const payload = readStepPayload(step);
  assertGenericPayloadScopes(payload, "PersistEvidence");
  const evidence = asRecord(payload.evidence);
  assertOptionalScopeField(evidence.scope, "PersistEvidence.evidence", "scope");

  if (!deps.persistEvidence) {
    return errorResult("NOT_IMPLEMENTED_PRD005");
  }

  const result = await deps.persistEvidence({ evidence });
  return okResult(result, { actOutput: result });
};

const linkDecisionEvidence: StepExecutor = async (
  _state: Readonly<GraphState>,
  step: Step,
  deps: PlanExecutorDeps
): Promise<StepExecutionResult> => {
  const payload = readStepPayload(step);
  assertGenericPayloadScopes(payload, "LinkDecisionEvidence");

  const decisionId = payload.decisionId;
  const evidenceId = payload.evidenceId;
  if (typeof decisionId !== "string" || decisionId.trim() === "") {
    throw new FailFastError("LINK_DECISION_EVIDENCE_INVALID decisionId must be a non-empty string");
  }
  if (typeof evidenceId !== "string" || evidenceId.trim() === "") {
    throw new FailFastError("LINK_DECISION_EVIDENCE_INVALID evidenceId must be a non-empty string");
  }

  if (!deps.linkDecisionEvidence) {
    return errorResult("NOT_IMPLEMENTED_PRD005");
  }

  const result = await deps.linkDecisionEvidence({ decisionId, evidenceId });
  return okResult(result, { actOutput: result });
};

const persistSession: StepExecutor = async (
  state: Readonly<GraphState>,
  step: Step,
  deps: PlanExecutorDeps
): Promise<StepExecutionResult> => {
  if (!deps.persistSession) {
    throw new FailFastError("NOT_IMPLEMENTED_PRD004");
  }

  const payload = readStepPayload(step);
  const projectIdFromPayload = payload.projectId;
  const projectId =
    typeof projectIdFromPayload === "string" && projectIdFromPayload.trim() !== ""
      ? projectIdFromPayload
      : state.projectId;
  if (typeof projectId !== "string" || projectId.trim() === "") {
    throw new FailFastError("PERSIST_SESSION_INVALID projectId is required");
  }

  const result = await deps.persistSession({
    projectId,
    stateSnapshot: state,
  });
  return okResult(result, { actOutput: result });
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
