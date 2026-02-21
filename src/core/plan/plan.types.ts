export type StepType =
  | "RepoScan"
  | "ContextSelect"
  | "RetrieveMemory"
  | "RetrieveDecisionContext"
  | "PromptAssemble"
  | "LLMCall"
  | "SummarizeMemory"
  | "PersistMemory"
  | "PersistDecision"
  | "PersistEvidence"
  | "LinkDecisionEvidence"
  | "PersistSession";

export const STEP_TYPES = Object.freeze([
  "RepoScan",
  "ContextSelect",
  "RetrieveMemory",
  "RetrieveDecisionContext",
  "PromptAssemble",
  "LLMCall",
  "SummarizeMemory",
  "PersistMemory",
  "PersistDecision",
  "PersistEvidence",
  "LinkDecisionEvidence",
  "PersistSession",
] as const satisfies readonly StepType[]);

export const STEP_TYPES_CANONICAL_ORDER = STEP_TYPES;

export const MANDATORY_STEP_TYPES = Object.freeze([
  "ContextSelect",
  "PromptAssemble",
  "LLMCall",
  "PersistSession",
] as const satisfies readonly StepType[]);

export interface PlanMetadata {
  readonly topK?: number;
  readonly timeouts?: {
    readonly llmMs?: number;
    readonly ioMs?: number;
  };
  readonly budgets?: {
    readonly promptTokens?: number;
  };
  readonly policyProfile: string;
  readonly mode: string;
}

export interface StepDefinition {
  readonly id: string;
  readonly type: StepType;
  readonly payload: unknown;
}

export interface ExecutionPlanV1 {
  readonly step_contract_version: "1" | "1.1";
  readonly extensions: readonly [];
  readonly metadata: PlanMetadata;
  readonly steps: readonly StepDefinition[];
}

export interface LegacyStep {
  readonly kind?: string;
  readonly type?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface LegacyExecutionPlan {
  readonly version: string;
  readonly steps: readonly LegacyStep[];
}

export type ExecutionPlan = ExecutionPlanV1 | LegacyExecutionPlan;
export type Step = StepDefinition | LegacyStep;

export type PolicyRef = Readonly<Record<string, unknown>>;

export interface GraphState {
  readonly userInput: string;
  readonly executionPlan: ExecutionPlan;
  readonly policyRef: PolicyRef;
  readonly currentMode?: string;
  readonly currentDomain?: string;
  readonly loadedDocs?: readonly string[];
  readonly selectedContext?: string;
  readonly assembledPrompt?: string;
  readonly actOutput?: unknown;
  readonly stepResults?: Readonly<Record<string, unknown>>;
  readonly stepUnavailableReasons?: Readonly<Record<string, string>>;
  readonly repoScanVersion?: string;
  readonly repoContextArtifactPath?: string;
  readonly repoContextUnavailableReason?: string;
  readonly lastResponse?: string;
  readonly stepLog: readonly string[];
}

export interface LLMClientPort {
  generate(prompt: string): Promise<string>;
}

export interface MemoryWriteRecord {
  readonly userInput: string;
  readonly assembledPrompt?: string;
  readonly lastResponse?: string;
  readonly policyRef: PolicyRef;
}

export interface MemoryRepositoryPort {
  write(record: MemoryWriteRecord): Promise<void>;
}

export interface ContextSelectionInput {
  readonly userInput: string;
  readonly loadedDocs: readonly string[];
  readonly stepResults?: Readonly<Record<string, unknown>>;
  readonly policyRef: PolicyRef;
}

export interface PromptAssemblyInput {
  readonly userInput: string;
  readonly selectedContext?: string;
  readonly loadedDocs: readonly string[];
  readonly stepResults?: Readonly<Record<string, unknown>>;
  readonly policyRef: PolicyRef;
}

export interface PlanExecutorDeps {
  readonly llmClient: LLMClientPort;
  readonly memoryRepo: MemoryRepositoryPort;
  readonly retrieveDecisionContext?: (input: {
    readonly input: string;
    readonly currentDomain?: string;
  }) => Promise<{
    readonly decisions: readonly unknown[];
    readonly anchors: readonly unknown[];
  }> | {
    readonly decisions: readonly unknown[];
    readonly anchors: readonly unknown[];
  };
  readonly persistDecision?: (input: {
    readonly decision: Readonly<Record<string, unknown>>;
  }) => Promise<{
    readonly id: string;
    readonly version: number;
  }> | {
    readonly id: string;
    readonly version: number;
  };
  readonly persistEvidence?: (input: {
    readonly evidence: Readonly<Record<string, unknown>>;
  }) => Promise<{
    readonly id: string;
  }> | {
    readonly id: string;
  };
  readonly linkDecisionEvidence?: (input: {
    readonly decisionId: string;
    readonly evidenceId: string;
  }) => Promise<{
    readonly status: "linked";
  }> | {
    readonly status: "linked";
  };
  readonly loadDocsForMode?: (
    policyRef: PolicyRef
  ) => Promise<readonly string[]> | readonly string[];
  readonly selectContext?: (
    input: ContextSelectionInput
  ) => Promise<string> | string;
  readonly assemblePrompt?: (input: PromptAssemblyInput) => string;
}

export function isExecutionPlanV1(plan: ExecutionPlan): plan is ExecutionPlanV1 {
  return (
    typeof (plan as { step_contract_version?: unknown }).step_contract_version === "string"
  );
}

export function resolveStepKind(step: Step): string {
  if ("id" in step && "payload" in step && typeof step.type === "string") {
    return step.type;
  }
  if (typeof step.kind === "string" && step.kind.trim() !== "") {
    return step.kind;
  }
  if (typeof step.type === "string" && step.type.trim() !== "") {
    return step.type;
  }
  return "";
}
