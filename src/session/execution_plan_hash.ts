import crypto from "node:crypto";
import type { ExecutionPlan, PolicyRef } from "../core/plan/plan.types";

interface ExecutionPlanHashInput {
  readonly executionPlan: ExecutionPlan;
  readonly policyRef: PolicyRef;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  const encoded = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(row[key])}`);
  return `{${encoded.join(",")}}`;
}

export function computeExecutionPlanHash(input: ExecutionPlanHashInput): string {
  const canonicalPayload = canonicalize({
    policyRef: input.policyRef,
    executionPlan: input.executionPlan,
  });

  return crypto.createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
}
