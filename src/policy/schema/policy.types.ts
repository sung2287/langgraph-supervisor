import type { StepType } from "../../core/plan/plan.types";

export interface LegacyExecutionStep {
  type: string;
  params: Record<string, unknown>;
}

export interface KindExecutionStep {
  kind: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ExecutionStep = LegacyExecutionStep | KindExecutionStep;

export interface LegacyExecutionPlan {
  version: string;
  steps: ExecutionStep[];
  metadata: {
    modeLabel?: string;
    policyId: string;
  };
}

export interface NormalizedStep {
  id: string;
  type: StepType;
  payload?: Record<string, unknown>;
}

export interface NormalizedExecutionPlan {
  step_contract_version: "1" | "1.1";
  extensions: readonly [];
  metadata: {
    policyProfile: string;
    mode: string;
    topK?: number;
  };
  steps: NormalizedStep[];
}

export type ExecutionPlan = LegacyExecutionPlan;

export interface ModeDefinition {
  id: string;
  plan: ExecutionStep[];
}

export interface ModesFile {
  version: string;
  modes: ModeDefinition[];
}

export type TriggerType = "HARD" | "SOFT";

export interface TriggerDefinition {
  condition: string;
  target_mode: string;
  type: TriggerType;
}

export interface TriggersFile {
  version: string;
  triggers: TriggerDefinition[];
}

export interface BundleDefinition {
  mode_id: string;
  files: string[];
}

export interface BundlesFile {
  version: string;
  bundles: BundleDefinition[];
}
