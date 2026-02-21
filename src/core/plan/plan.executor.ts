import type {
  ExecutionPlan,
  ExecutionPlanV1,
  GraphState,
  PlanExecutorDeps,
  Step,
  StepDefinition,
  StepType,
} from "./plan.types";
import {
  isExecutionPlanV1,
  MANDATORY_STEP_TYPES,
  resolveStepKind,
  STEP_TYPES_CANONICAL_ORDER,
} from "./plan.types";
import {
  applyPatch,
  type StatePatch,
  type StepExecutionResult,
  type StepExecutorRegistry,
} from "./step.registry";
import { CycleFailError, FailFastError } from "./errors";
import { hasForbiddenMemoryPayloadKeys } from "./memory_payload.guard";

const FAIL_FAST_STEP_TYPES = new Set<StepType>([
  "PersistMemory",
  "PersistDecision",
  "PersistEvidence",
  "LinkDecisionEvidence",
  "PersistSession",
]);

const LEGACY_FAIL_FAST_STEP_KINDS = new Set(["MemoryWrite", "memory_write"]);
const MEMORY_WRITE_STEP_TYPES = new Set<StepType>(["PersistMemory"]);
const LEGACY_MEMORY_WRITE_STEP_KINDS = new Set(["MemoryWrite", "memory_write", "PersistMemory"]);

function assertRunnable(plan: ExecutionPlan, state: GraphState): void {
  if (!state.policyRef || typeof state.policyRef !== "object") {
    throw new Error("PLAN_EXECUTION_ERROR policyRef must be resolved before Core execution");
  }

  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error("PLAN_EXECUTION_ERROR executionPlan.steps must not be empty");
  }
}

function mergeStepOutcome(
  state: GraphState,
  resultKey: string,
  result: StepExecutionResult
): GraphState {
  const nextState = applyPatch(state, result.patch);
  const stepResults = { ...(nextState.stepResults ?? {}) };
  const stepUnavailableReasons = { ...(nextState.stepUnavailableReasons ?? {}) };

  switch (result.kind) {
    case "ok": {
      if (typeof result.data !== "undefined") {
        stepResults[resultKey] = result.data;
      }
      break;
    }
    case "unavailable": {
      stepResults[resultKey] = {
        unavailable: true,
        reason: result.reason,
      };
      stepUnavailableReasons[resultKey] = result.reason;
      break;
    }
    case "error": {
      stepResults[resultKey] = {
        error: true,
        message: result.error.message,
        name: result.error.name,
      };
      stepUnavailableReasons[resultKey] = result.error.message;
      break;
    }
  }

  const outcomePatch: StatePatch = {
    stepResults,
    stepUnavailableReasons,
    actOutput: stepResults[resultKey],
  };

  return applyPatch(nextState, outcomePatch);
}

function createResultError(errorLike: { message: string; name?: string }): Error {
  const error = new Error(errorLike.message);
  if (typeof errorLike.name === "string" && errorLike.name !== "") {
    error.name = errorLike.name;
  }
  return error;
}

function wrapStepFailure(kind: string, cause: unknown, isFailFast: boolean): Error {
  if (cause instanceof FailFastError || cause instanceof CycleFailError) {
    return cause;
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  if (isFailFast) {
    return new FailFastError(`STEP_EXECUTION_FAILED ${kind}: ${message}`, { cause });
  }
  return new CycleFailError(`STEP_EXECUTION_FAILED ${kind}: ${message}`, { cause });
}

function assertMemoryWritePayloadClean(payload: unknown, stepKey: string): void {
  if (hasForbiddenMemoryPayloadKeys(payload)) {
    throw new FailFastError(
      `MEMORY_WRITE_FORBIDDEN_PAYLOAD_KEYS step='${stepKey}' keys=[summary,keywords,memories]`
    );
  }
}

function assertPlanVersionGate(plan: ExecutionPlan): asserts plan is ExecutionPlanV1 {
  if (!isExecutionPlanV1(plan)) {
    throw new FailFastError("PLAN_CONTRACT_ERROR step_contract_version is required");
  }
  if (plan.step_contract_version !== "1" && plan.step_contract_version !== "1.1") {
    throw new FailFastError(
      `PLAN_CONTRACT_ERROR unsupported step_contract_version=${String(plan.step_contract_version)}`
    );
  }
  if (!Array.isArray(plan.extensions) || plan.extensions.length !== 0) {
    throw new FailFastError("PLAN_CONTRACT_ERROR extensions must be an empty array");
  }
}

function validateStepSequence(steps: readonly StepDefinition[]): void {
  const seenIds = new Set<string>();
  const seenTypes = new Set<StepType>();
  let cursor = -1;

  for (const step of steps) {
    if (typeof step.id !== "string" || step.id.trim() === "") {
      throw new CycleFailError("PLAN_CONTRACT_ERROR StepDefinition.id must be a non-empty string");
    }
    if (seenIds.has(step.id)) {
      throw new CycleFailError(`PLAN_CONTRACT_ERROR duplicate StepDefinition.id: ${step.id}`);
    }
    seenIds.add(step.id);

    if (seenTypes.has(step.type)) {
      throw new CycleFailError(`PLAN_CONTRACT_ERROR duplicate StepType: ${step.type}`);
    }
    seenTypes.add(step.type);

    const nextIndex = STEP_TYPES_CANONICAL_ORDER.indexOf(step.type);
    if (nextIndex < 0) {
      throw new CycleFailError(`PLAN_CONTRACT_ERROR unauthorized StepType: ${step.type}`);
    }
    if (nextIndex < cursor) {
      throw new CycleFailError(
        `PLAN_CONTRACT_ERROR non-canonical order detected at step.id=${step.id} type=${step.type}`
      );
    }
    cursor = nextIndex;
  }

  for (const mandatoryType of MANDATORY_STEP_TYPES) {
    if (!seenTypes.has(mandatoryType)) {
      throw new CycleFailError(`PLAN_CONTRACT_ERROR missing mandatory step: ${mandatoryType}`);
    }
  }
}

function validateV1Plan(
  plan: ExecutionPlan,
  registry: StepExecutorRegistry
): ExecutionPlanV1 {
  assertPlanVersionGate(plan);
  validateStepSequence(plan.steps);

  for (const step of plan.steps) {
    if (!registry.isRegistered(step.type)) {
      throw new CycleFailError(`PLAN_CONTRACT_ERROR unregistered StepType: ${step.type}`);
    }
  }
  return plan;
}

function isStepTypeFailFast(stepType: StepType): boolean {
  return FAIL_FAST_STEP_TYPES.has(stepType);
}

function resolveLegacyStepResultKey(step: Step): string {
  return resolveStepKind(step);
}

export async function executePlan(
  plan: ExecutionPlan,
  state: GraphState,
  deps: PlanExecutorDeps,
  registry: StepExecutorRegistry
): Promise<GraphState> {
  assertRunnable(plan, state);

  let nextState = applyPatch(state, {
    stepLog: [...state.stepLog],
  });

  if (isExecutionPlanV1(plan)) {
    const v1Plan = validateV1Plan(plan, registry);

    for (const step of v1Plan.steps) {
      if (MEMORY_WRITE_STEP_TYPES.has(step.type)) {
        assertMemoryWritePayloadClean(step.payload, step.id);
      }
      if (step.type === "RetrieveMemory" && typeof v1Plan.metadata.topK !== "number") {
        throw new CycleFailError("RetrieveMemory requires metadata.topK");
      }

      let result: StepExecutionResult;
      try {
        result = await registry.execute(step.type, step, nextState, deps);
      } catch (error) {
        throw wrapStepFailure(step.type, error, isStepTypeFailFast(step.type));
      }

      if (result.kind === "error") {
        throw wrapStepFailure(
          step.type,
          createResultError(result.error),
          isStepTypeFailFast(step.type)
        );
      }

      nextState = mergeStepOutcome(nextState, step.id, result);
      nextState = applyPatch(nextState, {
        stepLog: [...nextState.stepLog, step.id],
      });
    }
    return nextState;
  }

  for (const step of plan.steps) {
    const stepKind = resolveStepKind(step);
    if (stepKind === "") {
      throw new Error("PLAN_EXECUTION_ERROR step.kind or step.type must be a non-empty string");
    }
    if (LEGACY_MEMORY_WRITE_STEP_KINDS.has(stepKind)) {
      const legacyPayload = "params" in step ? step.params : undefined;
      assertMemoryWritePayloadClean(legacyPayload, stepKind);
    }

    let result: StepExecutionResult;
    try {
      result = await registry.execute(stepKind, step, nextState, deps);
    } catch (error) {
      const isFailFast = LEGACY_FAIL_FAST_STEP_KINDS.has(stepKind);
      throw wrapStepFailure(stepKind, error, isFailFast);
    }

    if (result.kind === "error") {
      const isFailFast = LEGACY_FAIL_FAST_STEP_KINDS.has(stepKind);
      throw wrapStepFailure(stepKind, createResultError(result.error), isFailFast);
    }

    const resultKey = resolveLegacyStepResultKey(step);
    nextState = mergeStepOutcome(nextState, resultKey, result);
    nextState = applyPatch(nextState, {
      stepLog: [...nextState.stepLog, resultKey],
    });
  }

  return nextState;
}
