export const DECISION_SCOPE_ALLOWLIST = Object.freeze([
  "global",
  "runtime",
  "wms",
  "coding",
  "ui",
] as const);

export type DecisionScope = (typeof DECISION_SCOPE_ALLOWLIST)[number];

export function normalizeDecisionScope(scope: string): string {
  return scope.trim().toLowerCase();
}

export function isAllowedDecisionScope(scope: string): scope is DecisionScope {
  const normalized = normalizeDecisionScope(scope);
  return DECISION_SCOPE_ALLOWLIST.some((allowed) => allowed === normalized);
}
