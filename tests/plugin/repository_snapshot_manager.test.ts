/** Intent: PRD-003 Route B snapshot manager lock — fixed path safety, null-safe reads, atomic runtime write, and freshness boundary. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SCAN_RESULT_REL_PATH,
  isFresh,
  readScanResult,
  resolveScanResultPath,
  writeScanResult,
} from "../../src/plugin/repository/snapshot_manager";
import type { ScanResult } from "../../src/plugin/repository/scanner";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sampleResult(scanVersionMs: number): ScanResult {
  return {
    schemaVersion: 1,
    createdAtMs: scanVersionMs,
    scanVersionMs,
    ignore: ["node_modules/**", ".git/**", "ops/runtime/**"],
    fileCount: 1,
    totalBytes: 3,
    fileIndex: [
      {
        path: "src/a.ts",
        size: 3,
        mtimeMs: scanVersionMs,
      },
    ],
  };
}

test("snapshot manager: fixed path resolution", () => {
  const repoRoot = makeTempDir("snapshot-resolve-");
  try {
    const resolved = resolveScanResultPath(repoRoot);
    const expected = path.join(path.resolve(repoRoot), "ops/runtime/scan-result.json");
    assert.equal(resolved, expected);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("snapshot manager: sep-aware weird-root rejection", (t) => {
  if (process.platform === "win32") {
    t.skip("weird-root containment edge-case is POSIX-specific");
    return;
  }

  assert.throws(() => resolveScanResultPath("/"), /Path escapes repo root/);
});

test("snapshot manager: null-safe reads for missing/invalid/wrong shape", async () => {
  const repoRoot = makeTempDir("snapshot-read-");
  try {
    assert.equal(await readScanResult(repoRoot), null);

    const scanPath = path.join(repoRoot, ...SCAN_RESULT_REL_PATH.split("/"));
    fs.mkdirSync(path.dirname(scanPath), { recursive: true });

    fs.writeFileSync(scanPath, "not-json", "utf8");
    assert.equal(await readScanResult(repoRoot), null);

    fs.writeFileSync(scanPath, JSON.stringify({ schemaVersion: 2, fileIndex: [] }), "utf8");
    assert.equal(await readScanResult(repoRoot), null);

    fs.writeFileSync(scanPath, JSON.stringify({ schemaVersion: 1, fileIndex: "bad" }), "utf8");
    assert.equal(await readScanResult(repoRoot), null);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("snapshot manager: atomic write creates runtime path and readable JSON", async () => {
  const repoRoot = makeTempDir("snapshot-write-");
  try {
    const result = sampleResult(1000);
    await writeScanResult(repoRoot, result);

    const scanPath = path.join(repoRoot, ...SCAN_RESULT_REL_PATH.split("/"));
    assert.equal(fs.existsSync(scanPath), true);

    const text = fs.readFileSync(scanPath, "utf8");
    assert.equal(text.endsWith("\n"), true);

    const parsed = JSON.parse(text) as ScanResult;
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.scanVersionMs, 1000);
    assert.equal(parsed.fileIndex.length, 1);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("snapshot manager: freshness boundary and stale rule", () => {
  const result = sampleResult(1000);
  assert.equal(isFresh(result, 1600, 600), true);
  assert.equal(isFresh(result, 1601, 600), false);
  assert.equal(isFresh(result, 1600, 0), false);
  assert.equal(isFresh(result, 1600, -10), false);
});
