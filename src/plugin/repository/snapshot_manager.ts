import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { ScanResult } from "./scanner";

export const SCAN_RESULT_REL_PATH = "ops/runtime/scan-result.json";

export function resolveScanResultPath(repoRootAbs: string): string {
  const rootAbs = path.resolve(repoRootAbs);
  const targetAbs = path.resolve(rootAbs, SCAN_RESULT_REL_PATH);
  const allowedAbs = path.join(rootAbs, SCAN_RESULT_REL_PATH);

  const isPathWithinRoot =
    targetAbs === rootAbs ? false : targetAbs.startsWith(rootAbs + path.sep);

  if (!(targetAbs === allowedAbs && isPathWithinRoot)) {
    throw new Error("Path escapes repo root");
  }

  return targetAbs;
}

function isMinimalScanResult(value: unknown): value is ScanResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;
  return row.schemaVersion === 1 && Array.isArray(row.fileIndex);
}

export async function readScanResult(repoRootAbs: string): Promise<ScanResult | null> {
  const targetAbs = resolveScanResultPath(repoRootAbs);

  let raw: string;
  try {
    raw = await fs.readFile(targetAbs, "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  return isMinimalScanResult(parsed) ? (parsed as ScanResult) : null;
}

export async function writeScanResult(
  repoRootAbs: string,
  result: ScanResult
): Promise<void> {
  const targetAbs = resolveScanResultPath(repoRootAbs);
  const dir = path.dirname(targetAbs);

  await fs.mkdir(dir, { recursive: true });

  const randomHex = crypto.randomBytes(6).toString("hex");
  const tmp = `${targetAbs}.tmp-${process.pid}-${randomHex}`;

  await fs.writeFile(tmp, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await fs.rename(tmp, targetAbs);
}

export function isFresh(
  result: ScanResult,
  nowMs: number,
  freshnessMs: number
): boolean {
  if (freshnessMs <= 0) {
    return false;
  }

  return nowMs - result.scanVersionMs <= freshnessMs;
}
