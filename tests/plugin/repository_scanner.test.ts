/** Intent: PRD-003 Route B scanner lock — deterministic ordering, ignore coverage, sha1 default-off, and symlink safety. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanRepository } from "../../src/plugin/repository/scanner";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(rootAbs: string, relPath: string, content: string): void {
  const absPath = path.join(rootAbs, ...relPath.split("/"));
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf8");
}

test("scanner: deterministic lexicographic ordering on normalized paths", async () => {
  const repoRoot = makeTempDir("scanner-order-");
  try {
    writeFile(repoRoot, "src/z.ts", "z");
    writeFile(repoRoot, "src/a.ts", "a");
    writeFile(repoRoot, "alpha.txt", "root");

    const result = await scanRepository({
      repoRootAbs: repoRoot,
      nowMs: 1000,
    });

    const paths = result.fileIndex.map((entry) => entry.path);
    const sorted = [...paths].sort((a, b) => a.localeCompare(b));

    assert.deepEqual(paths, sorted);
    for (const relPath of paths) {
      assert.equal(relPath.includes("\\"), false);
      assert.equal(path.isAbsolute(relPath), false);
      assert.equal(relPath.includes(".."), false);
    }
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("scanner: ignores node_modules/.git/ops-runtime and sha1 default is absent", async () => {
  const repoRoot = makeTempDir("scanner-ignore-");
  try {
    writeFile(repoRoot, "src/keep.ts", "ok");
    writeFile(repoRoot, "node_modules/pkg/index.js", "ignored");
    writeFile(repoRoot, ".git/config", "ignored");
    writeFile(repoRoot, "ops/runtime/scan-result.json", "ignored");

    const result = await scanRepository({
      repoRootAbs: repoRoot,
      nowMs: 1000,
    });

    const paths = result.fileIndex.map((entry) => entry.path);
    assert.equal(paths.includes("src/keep.ts"), true);
    assert.equal(paths.some((p) => p.startsWith("node_modules/")), false);
    assert.equal(paths.some((p) => p.startsWith(".git/")), false);
    assert.equal(paths.some((p) => p.startsWith("ops/runtime/")), false);

    for (const entry of result.fileIndex) {
      assert.equal(entry.sha1, undefined);
    }
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("scanner: symlink that resolves outside repo root is skipped", async (t) => {
  const repoRoot = makeTempDir("scanner-symlink-root-");
  const outsideRoot = makeTempDir("scanner-symlink-out-");

  try {
    writeFile(repoRoot, "src/keep.ts", "ok");
    const outsideFile = path.join(outsideRoot, "outside.txt");
    fs.writeFileSync(outsideFile, "outside", "utf8");

    const linkPath = path.join(repoRoot, "src", "outside-link.txt");
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });

    try {
      fs.symlinkSync(outsideFile, linkPath);
    } catch (error) {
      const maybe = error as NodeJS.ErrnoException;
      if (
        process.platform === "win32" &&
        (maybe.code === "EPERM" || maybe.code === "EACCES")
      ) {
        t.skip("symlink creation requires elevated privileges on this Windows setup");
        return;
      }
      throw error;
    }

    const result = await scanRepository({
      repoRootAbs: repoRoot,
      nowMs: 1000,
    });

    const paths = result.fileIndex.map((entry) => entry.path);
    assert.equal(paths.includes("src/keep.ts"), true);
    assert.equal(paths.includes("src/outside-link.txt"), false);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});
