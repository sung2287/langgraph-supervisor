import fs from "node:fs";
import path from "node:path";
import {
  type BundleDefinition,
  type BundlesFile,
  type ExecutionStep,
  type ModesFile,
  type ModeDefinition,
  type NormalizedExecutionPlan,
  type NormalizedStep,
  type TriggersFile,
} from "../schema/policy.types";
import { loadYamlFile } from "./yaml.loader";
import {
  validateBundlesFile,
  validateModesFile,
  validateTriggersFile,
} from "./policy.validator";
import type { StepType } from "../../core/plan/plan.types";
import { ConfigurationError } from "./policy.errors";

export interface PolicyInterpreterOptions {
  repoRoot: string;
  profile: string;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Object.isFrozen(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => deepFreeze(item));
  } else {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      deepFreeze(item)
    );
  }

  return Object.freeze(value);
}

function fail(absPath: string, message: string): never {
  throw new Error(`POLICY_INTERPRETER_ERROR ${absPath}: ${message}`);
}

const LEGACY_STEP_TO_CANONICAL: Readonly<Record<string, StepType>> = Object.freeze({
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

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizePayload(step: ExecutionStep): Record<string, unknown> {
  const raw = step as Record<string, unknown>;
  return asRecord(raw.params);
}

function resolveLegacyStepName(step: ExecutionStep): string {
  const raw = step as Record<string, unknown>;
  if (typeof raw.kind === "string" && raw.kind.trim() !== "") {
    return raw.kind.trim();
  }
  if (typeof raw.type === "string" && raw.type.trim() !== "") {
    return raw.type.trim();
  }
  throw new Error("PLAN_NORMALIZATION_ERROR step requires non-empty kind or type");
}

function mapStepType(rawType: string): StepType {
  const mapped = LEGACY_STEP_TO_CANONICAL[rawType];
  if (!mapped) {
    throw new Error(`PLAN_NORMALIZATION_ERROR unsupported step type '${rawType}'`);
  }
  return mapped;
}

function normalizeStep(step: ExecutionStep, idx: number): NormalizedStep {
  const raw = step as Record<string, unknown>;
  const id =
    typeof raw.id === "string" && raw.id.trim() !== ""
      ? raw.id.trim()
      : `step-${String(idx + 1)}`;
  return {
    id,
    type: mapStepType(resolveLegacyStepName(step)),
    payload: normalizePayload(step),
  };
}

function ensurePersistSession(steps: NormalizedStep[]): NormalizedStep[] {
  if (steps.some((step) => step.type === "PersistSession")) {
    return steps;
  }
  const existingIds = new Set(steps.map((step) => step.id));
  let seq = steps.length + 1;
  let nextId = `step-${String(seq)}`;
  while (existingIds.has(nextId)) {
    seq += 1;
    nextId = `step-${String(seq)}`;
  }
  return [...steps, { id: nextId, type: "PersistSession", payload: {} }];
}

export class PolicyInterpreter {
  readonly profileRoot: string;
  readonly profile: string;
  private readonly modesPath: string;
  private readonly triggersPath: string;
  private readonly bundlesPath: string;
  private readonly modesFile: ModesFile;
  private readonly triggersFile: TriggersFile;
  private readonly bundlesFile: BundlesFile;

  constructor(opts: PolicyInterpreterOptions) {
    this.profile = opts.profile.trim();
    if (this.profile === "") {
      throw new Error("POLICY_INTERPRETER_ERROR profile must not be empty");
    }

    this.profileRoot = path.join(opts.repoRoot, "policy", "profiles", this.profile);
    if (!fs.existsSync(this.profileRoot) || !fs.statSync(this.profileRoot).isDirectory()) {
      throw new Error(
        `POLICY_INTERPRETER_ERROR ${this.profileRoot}: profile directory does not exist`
      );
    }

    this.modesPath = path.join(this.profileRoot, "modes.yaml");
    this.triggersPath = path.join(this.profileRoot, "triggers.yaml");
    this.bundlesPath = path.join(this.profileRoot, "bundles.yaml");

    this.modesFile = validateModesFile(loadYamlFile(this.modesPath), this.modesPath);
    this.triggersFile = validateTriggersFile(
      loadYamlFile(this.triggersPath),
      this.triggersPath
    );
    this.bundlesFile = validateBundlesFile(
      loadYamlFile(this.bundlesPath),
      this.bundlesPath
    );
  }

  resolveExecutionPlan(input: {
    userInput: string;
    requestedPhase?: string;
  }): NormalizedExecutionPlan {
    const requestedPhase = input.requestedPhase?.trim();
    const mode = requestedPhase
      ? this.modesFile.modes.find(
          (m) => m.id.toLowerCase() === requestedPhase.toLowerCase()
        )
      : this.findMode(this.resolveTargetMode(input.userInput));

    if (!mode && requestedPhase) {
      throw new ConfigurationError(
        `POLICY_CONFIGURATION_ERROR Unknown phase "${requestedPhase}". Available modes: ${this.modesFile.modes
          .map((m) => m.id)
          .join(", ")}`
      );
    }

    if (!mode) {
      fail(this.modesPath, `target mode '${this.resolveTargetMode(input.userInput)}' is not defined`);
    }

    const normalizedSteps = ensurePersistSession(
      mode.plan.map((step, idx) => normalizeStep(step, idx))
    );
    const retrieveMemoryStep = normalizedSteps.find((step) => step.type === "RetrieveMemory");
    const topKCandidate = retrieveMemoryStep
      ? asRecord(retrieveMemoryStep.payload).topK
      : undefined;
    const stepContractVersion = normalizedSteps.some((step) => V11_ONLY_STEP_TYPES.has(step.type))
      ? "1.1"
      : "1";

    const plan: NormalizedExecutionPlan = {
      step_contract_version: stepContractVersion,
      steps: normalizedSteps,
      metadata: {
        mode: mode.id,
        policyProfile: this.profile,
        topK:
          typeof topKCandidate === "number" && Number.isFinite(topKCandidate)
            ? topKCandidate
            : undefined,
      },
    };

    return deepFreeze(plan);
  }

  getBundlesForMode(modeId: string): BundleDefinition[] {
    return this.bundlesFile.bundles.filter((bundle) => bundle.mode_id === modeId);
  }

  private resolveTargetMode(userInput: string): string {
    for (const trigger of this.triggersFile.triggers) {
      if (this.matchesCondition(trigger.condition, userInput)) {
        return trigger.target_mode;
      }
    }
    return "default";
  }

  private findMode(modeId: string): ModeDefinition | undefined {
    return this.modesFile.modes.find((mode) => mode.id === modeId);
  }

  private matchesCondition(condition: string, userInput: string): boolean {
    const raw = condition.trim();
    if (raw.startsWith("re:")) {
      const pattern = raw.slice(3).trim();
      if (pattern === "") {
        fail(this.triggersPath, "trigger condition 're:' requires a pattern");
      }
      try {
        return new RegExp(pattern).test(userInput);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fail(this.triggersPath, `invalid regex pattern '${pattern}': ${message}`);
      }
    }

    return userInput.toLowerCase().includes(raw.toLowerCase());
  }
}
