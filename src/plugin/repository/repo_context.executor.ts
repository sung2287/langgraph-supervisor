import type { GraphState, Step } from "../../core/plan/plan.types";
import type { StepExecutionResult, StepExecutor } from "../../core/plan/step.registry";
import { scanRepository } from "./scanner";
import {
  SCAN_RESULT_REL_PATH,
  isFresh,
  readScanResult,
  resolveScanResultPath,
  writeScanResult,
} from "./snapshot_manager";

export interface RepoContextExecutorOptions {
  readonly repoRoot: string;
  readonly nowMs?: () => number;
}

interface RepoContextConfig {
  readonly storagePath: string;
  readonly freshnessMs: number;
  readonly rescanTag: string;
  readonly isFullScan: boolean;
  readonly forceRescan: boolean;
  readonly computeSha1: boolean;
  readonly maxFileIndexEntries: number;
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
  const params =
    "payload" in step ? asRecord(step.payload) : asRecord(step.params);
  return {
    storagePath: asString(params.storagePath, SCAN_RESULT_REL_PATH),
    freshnessMs: asNumber(params.freshnessMs, 600000),
    rescanTag: asString(params.rescanTag, "#rescan"),
    isFullScan: asBoolean(params.isFullScan, false),
    forceRescan: asBoolean(params.forceRescan, false),
    computeSha1: asBoolean(params.computeSha1, false),
    maxFileIndexEntries: asNumber(params.maxFileIndexEntries, 5000),
  };
}

function errorResult(message: string): StepExecutionResult {
  return {
    kind: "error",
    error: { message },
  };
}

export function createRepoContextExecutor(
  options: RepoContextExecutorOptions
): StepExecutor {
  const now = options.nowMs ?? Date.now;

  return async (state: Readonly<GraphState>, step: Step): Promise<StepExecutionResult> => {
    const config = readConfig(step);
    void config.isFullScan;

    if (config.storagePath !== SCAN_RESULT_REL_PATH) {
      return errorResult("INVALID_STORAGE_PATH");
    }

    const nowMs = now();
    const artifactPath = resolveScanResultPath(options.repoRoot);

    try {
      let snapshot = await readScanResult(options.repoRoot);

      const needsRescan =
        config.forceRescan ||
        state.userInput.includes(config.rescanTag) ||
        snapshot === null ||
        !isFresh(snapshot, nowMs, config.freshnessMs);

      if (needsRescan) {
        snapshot = await scanRepository({
          repoRootAbs: options.repoRoot,
          nowMs,
          computeSha1: config.computeSha1,
        });
        await writeScanResult(options.repoRoot, snapshot);
      }

      if (snapshot === null) {
        return {
          kind: "unavailable",
          reason: "RESCAN_REQUIRED",
          patch: {
            repoContextArtifactPath: artifactPath,
            repoContextUnavailableReason: "RESCAN_REQUIRED",
          },
        };
      }

      const maxEntries = Math.max(1, Math.floor(config.maxFileIndexEntries));
      const truncated = snapshot.fileIndex.length > maxEntries;
      const fileIndex = truncated
        ? snapshot.fileIndex.slice(0, maxEntries)
        : snapshot.fileIndex;

      const payload = {
        schemaVersion: snapshot.schemaVersion,
        scanVersionMs: snapshot.scanVersionMs,
        fileCount: snapshot.fileCount,
        totalBytes: snapshot.totalBytes,
        truncated,
        fileIndex,
      };

      return {
        kind: "ok",
        data: payload,
        patch: {
          repoScanVersion: String(snapshot.scanVersionMs),
          repoContextArtifactPath: artifactPath,
          repoContextUnavailableReason: undefined,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message);
    }
  };
}
