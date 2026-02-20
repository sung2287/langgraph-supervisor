export interface Step {
  readonly kind?: string;
  readonly type?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface ExecutionPlan {
  readonly version: string;
  readonly steps: readonly Step[];
}

export type PolicyRef = Readonly<Record<string, unknown>>;

export interface GraphState {
  readonly userInput: string;
  readonly executionPlan: ExecutionPlan;
  readonly policyRef: PolicyRef;
  readonly currentMode?: string;
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
  readonly loadDocsForMode?: (
    policyRef: PolicyRef
  ) => Promise<readonly string[]> | readonly string[];
  readonly selectContext?: (
    input: ContextSelectionInput
  ) => Promise<string> | string;
  readonly assemblePrompt?: (input: PromptAssemblyInput) => string;
}

export function resolveStepKind(step: Step): string {
  if (typeof step.kind === "string" && step.kind.trim() !== "") {
    return step.kind;
  }
  if (typeof step.type === "string" && step.type.trim() !== "") {
    return step.type;
  }
  return "";
}
