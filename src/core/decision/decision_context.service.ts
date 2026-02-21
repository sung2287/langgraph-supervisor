import { FailFastError } from "../plan/errors";
import {
  isAllowedDecisionScope,
  normalizeDecisionScope,
} from "./decision.scope";

export type DecisionStrength = "axis" | "lock" | "normal";

export interface DecisionRecordLike {
  readonly id: string;
}

export interface DecisionStorePort {
  getActiveByScopeStrength(
    scope: string,
    strength: DecisionStrength
  ): readonly DecisionRecordLike[];
}

export interface RetrieveDecisionContextInput {
  readonly currentDomain?: string;
}

export interface RetrieveDecisionContextResult {
  readonly decisions: readonly DecisionRecordLike[];
  readonly anchors: readonly [];
}

function assertAllowedScopeOrFailFast(scope: string, where: string): string {
  const normalized = normalizeDecisionScope(scope);
  if (!isAllowedDecisionScope(normalized)) {
    throw new FailFastError(
      `DECISION_SCOPE_INVALID ${where} scope='${scope}'`
    );
  }
  return normalized;
}

function mergeUniqueById(
  target: DecisionRecordLike[],
  source: readonly DecisionRecordLike[]
): void {
  const seen = new Set(target.map((decision) => decision.id));
  for (const decision of source) {
    if (typeof decision.id !== "string" || decision.id.trim() === "") {
      continue;
    }
    if (seen.has(decision.id)) {
      continue;
    }
    seen.add(decision.id);
    target.push(decision);
  }
}

export function retrieveDecisionContextHierarchically(
  store: DecisionStorePort,
  input: RetrieveDecisionContextInput
): RetrieveDecisionContextResult {
  const mergedDecisions: DecisionRecordLike[] = [];
  const globalScope = assertAllowedScopeOrFailFast("global", "global-axis");

  mergeUniqueById(
    mergedDecisions,
    store.getActiveByScopeStrength(globalScope, "axis")
  );

  const rawDomain =
    typeof input.currentDomain === "string" ? input.currentDomain.trim() : "";
  if (rawDomain === "") {
    return { decisions: mergedDecisions, anchors: [] };
  }

  const currentDomain = assertAllowedScopeOrFailFast(rawDomain, "currentDomain");
  for (const strength of ["axis", "lock", "normal"] as const) {
    mergeUniqueById(
      mergedDecisions,
      store.getActiveByScopeStrength(currentDomain, strength)
    );
  }

  return { decisions: mergedDecisions, anchors: [] };
}
