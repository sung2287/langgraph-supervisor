import type { PlanExecutorDeps } from "../../src/core/plan/plan.types";
import {
  type DecisionStrength,
  type SQLiteStorageLayer,
} from "../../src/adapter/storage/sqlite";
import { retrieveDecisionContextHierarchically } from "../../src/core/decision/decision_context.service";

export interface RuntimePlanExecutorDepsOptions {
  readonly llmClient: PlanExecutorDeps["llmClient"];
  readonly memoryRepo: PlanExecutorDeps["memoryRepo"];
  readonly storageLayer: SQLiteStorageLayer;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function requireString(
  value: unknown,
  label: string,
  allowEmpty = false
): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  const normalized = value.trim();
  if (!allowEmpty && normalized === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return normalized;
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  return value;
}

function normalizeDecisionStrength(value: unknown): DecisionStrength {
  const strength = requireString(value, "decision.strength");
  if (strength !== "axis" && strength !== "lock" && strength !== "normal") {
    throw new Error(`decision.strength unsupported value '${strength}'`);
  }
  return strength;
}

function normalizeEvidenceTags(value: unknown): string | undefined {
  if (typeof value === "undefined" || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  throw new Error("evidence.tags must be string or array");
}

export function createRuntimePlanExecutorDeps(
  options: RuntimePlanExecutorDepsOptions
): PlanExecutorDeps {
  return {
    llmClient: options.llmClient,
    memoryRepo: options.memoryRepo,
    retrieveDecisionContext: ({ currentDomain }) =>
      retrieveDecisionContextHierarchically(options.storageLayer.decisionStore, {
        currentDomain,
      }),
    persistDecision: ({ decision }) => {
      const body = asRecord(decision);
      const id = requireString(body.id, "decision.id");
      const rootId = requireString(body.rootId, "decision.rootId");
      const version = requireInteger(body.version, "decision.version");
      const text = requireString(body.text, "decision.text", true);
      const strength = normalizeDecisionStrength(body.strength);
      const scope = requireString(body.scope, "decision.scope");
      const previousVersionId =
        typeof body.previousVersionId === "undefined" || body.previousVersionId === null
          ? undefined
          : requireString(body.previousVersionId, "decision.previousVersionId");

      if (version === 1) {
        options.storageLayer.decisionStore.insertDecisionV1({
          id,
          rootId,
          version,
          previousVersionId,
          text,
          strength,
          scope,
          isActive: true,
        });
        return {
          id,
          version,
        };
      }

      if (previousVersionId === undefined) {
        throw new Error("decision.previousVersionId is required for version > 1");
      }

      options.storageLayer.decisionStore.createNextVersionAtomically(rootId, previousVersionId, {
        id,
        version,
        text,
        strength,
        scope,
      });

      return {
        id,
        version,
      };
    },
    persistEvidence: ({ evidence }) => {
      const body = asRecord(evidence);
      const id = requireString(body.id, "evidence.id");
      const content = requireString(body.content, "evidence.content", true);
      const tags = normalizeEvidenceTags(body.tags);

      options.storageLayer.evidenceStore.insertEvidence({
        id,
        content,
        tags,
      });

      return {
        id,
      };
    },
    linkDecisionEvidence: ({ decisionId, evidenceId }) => {
      options.storageLayer.linkStore.linkDecisionEvidence(
        requireString(decisionId, "decisionId"),
        requireString(evidenceId, "evidenceId")
      );
      return {
        status: "linked",
      };
    },
  };
}
