import crypto from "node:crypto";
import type { ExecutionPlan, PolicyRef } from "../core/plan/plan.types";
import { stableStringify } from "./stable_stringify";

export interface ExecutionContextMetadata {
  readonly provider: string;
  readonly model: string;
  readonly mode: string;
  readonly domain: string;
}

interface ExecutionPlanHashInput {
  readonly executionPlan: ExecutionPlan;
  readonly policyRef: PolicyRef;
  readonly metadata: ExecutionContextMetadata;
}

function validateMetadata(metadata: ExecutionContextMetadata): void {
  const provider = metadata.provider.trim();
  const model = metadata.model.trim();
  const mode = metadata.mode.trim();
  const domain = metadata.domain.trim();

  if (provider === "") {
    throw new Error("CONFIGURATION_ERROR hash metadata provider must be non-empty");
  }
  if (model === "") {
    throw new Error("CONFIGURATION_ERROR hash metadata model must be non-empty");
  }
  if (mode === "") {
    throw new Error("CONFIGURATION_ERROR hash metadata mode must be non-empty");
  }
  if (domain === "") {
    throw new Error("CONFIGURATION_ERROR hash metadata domain must be non-empty");
  }
}

export function computeExecutionPlanHash(input: ExecutionPlanHashInput): string {
  validateMetadata(input.metadata);

  const canonicalPayload = stableStringify({
    policyRef: input.policyRef,
    executionPlan: input.executionPlan,
    metadata: input.metadata,
  });

  return crypto.createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
}
