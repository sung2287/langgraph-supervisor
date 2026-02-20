export interface ExecutionStep {
  type: string;
  params: Record<string, unknown>;
}

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
