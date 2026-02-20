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

export interface PlanExecutionContext {
  userInput: string;
  repoPath: string;
  assembledPrompt: string;
  output: string;
  stepLog: string[];
  llmGenerate: (prompt: string) => Promise<string>;
}
