import fs from "node:fs";
import path from "node:path";
import type { GraphState, Step } from "../../core/plan/plan.types";
import type { StepExecutionResult, StepExecutor } from "../../core/plan/step.registry";

export interface RepoContextExecutorOptions {
  readonly repoRoot: string;
  readonly nowMs?: () => number;
}

interface RepoContextConfig {
  readonly storagePath: string;
  readonly freshnessMs: number;
  readonly rescanTag: string;
  readonly isFullScan: boolean;
}

interface SnapshotArtifact {
  readonly scanVersion?: unknown;
  readonly scanVersionMs?: unknown;
  readonly [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readConfig(step: Step): RepoContextConfig {
  const params = asRecord(step.params);
  return {
    storagePath: asString(params.storagePath, "ops/runtime/scan-result.json"),
    freshnessMs: asNumber(params.freshnessMs, 600000),
    rescanTag: asString(params.rescanTag, "#rescan"),
    isFullScan: asBoolean(params.isFullScan, false),
  };
}

function resolveStoragePath(repoRoot: string, storagePath: string): string {
  return path.resolve(repoRoot, storagePath);
}

function ensureRuntimeScopedPath(repoRoot: string, artifactPath: string): boolean {
  const runtimeRoot = path.resolve(repoRoot, "ops/runtime");
  const rel = path.relative(runtimeRoot, artifactPath);
  return !(rel.startsWith("..") || path.isAbsolute(rel));
}

function unavailable(reason: string, artifactPath: string): StepExecutionResult {
  return {
    kind: "unavailable",
    reason,
    patch: {
      repoContextArtifactPath: artifactPath,
      repoContextUnavailableReason: reason,
    },
  };
}

function extractScanVersionMs(artifact: SnapshotArtifact): number | undefined {
  return typeof artifact.scanVersionMs === "number" && Number.isFinite(artifact.scanVersionMs)
    ? artifact.scanVersionMs
    : undefined;
}

function extractScanVersion(artifact: SnapshotArtifact, scanVersionMs: number): string {
  if (typeof artifact.scanVersion === "string" && artifact.scanVersion.trim() !== "") {
    return artifact.scanVersion;
  }
  return String(scanVersionMs);
}

export function createRepoContextExecutor(
  options: RepoContextExecutorOptions
): StepExecutor {
  const nowMs = options.nowMs ?? Date.now;

  return async (state: Readonly<GraphState>, step: Step): Promise<StepExecutionResult> => {
    const config = readConfig(step);
    void config.isFullScan;

    const artifactPath = resolveStoragePath(options.repoRoot, config.storagePath);
    if (!ensureRuntimeScopedPath(options.repoRoot, artifactPath)) {
      return {
        kind: "error",
        error: {
          message: "INVALID_STORAGE_PATH",
        },
      };
    }

    if (state.userInput.includes(config.rescanTag)) {
      return unavailable("RESCAN_REQUIRED", artifactPath);
    }

    if (!fs.existsSync(artifactPath)) {
      return unavailable("RESCAN_REQUIRED", artifactPath);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    } catch {
      return unavailable("RESCAN_REQUIRED", artifactPath);
    }

    const artifact = asRecord(parsed) as SnapshotArtifact;
    const scanVersionMs = extractScanVersionMs(artifact);
    if (typeof scanVersionMs !== "number") {
      return unavailable("RESCAN_REQUIRED", artifactPath);
    }

    if (nowMs() - scanVersionMs > config.freshnessMs) {
      return unavailable("RESCAN_REQUIRED", artifactPath);
    }

    const scanVersion = extractScanVersion(artifact, scanVersionMs);

    return {
      kind: "ok",
      data: parsed,
      patch: {
        repoScanVersion: scanVersion,
        repoContextArtifactPath: artifactPath,
        repoContextUnavailableReason: undefined,
      },
    };
  };
}
