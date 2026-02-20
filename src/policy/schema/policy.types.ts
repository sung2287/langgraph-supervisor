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

export interface ExecutionPlan {
  version: string;
  steps: ExecutionStep[];
  metadata: {
    modeLabel?: string;
    policyId: string;
  };
}

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
