/**
 * Intent: PRD-005/006 집행 — Core는 Adapter를 절대 알면 안 된다.
 *         core -> adapter import가 존재하면 즉시 FAIL.
 *
 * Policy Type: Structural / Dependency (정적 규칙)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const CORE_ROOT = path.join(PROJECT_ROOT, "src", "core");

function listFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursively(p));
    else out.push(p);
  }
  return out;
}

function isCodeFile(p: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p);
}

function readText(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

test("PRD-005/006: core must not import adapter", () => {
  // core 폴더가 없을 리는 없지만, 방어적으로 처리
  if (!fs.existsSync(CORE_ROOT)) {
    assert.ok(true);
    return;
  }

  const files = listFilesRecursively(CORE_ROOT).filter(isCodeFile);
  const violations: Array<{ file: string; excerpt: string }> = [];

  const reAlias = /from\s+["']@?src\/adapter(?:\/.*)?["']/g;
  const reRelative = /from\s+["'][.\/]+adapter(?:\/.*)?["']/g;

  for (const f of files) {
    const txt = readText(f);
    const matches = [...(txt.match(reAlias) ?? []), ...(txt.match(reRelative) ?? [])];
    if (matches.length > 0) {
      violations.push({
        file: toPosix(path.relative(PROJECT_ROOT, f)),
        excerpt: matches.slice(0, 3).join("\n"),
      });
    }
  }

  if (violations.length > 0) {
    const msg =
      "\n[PRD-005/006 VIOLATION] Core is importing Adapter (FORBIDDEN)\n" +
      violations
        .map(
          (v) =>
            `- file: ${v.file}\n  excerpt:\n  ${v.excerpt
            .split("\n")
            .map((l) => "  " + l)
            .join("\n")}`
        )
        .join("\n\n");
    throw new Error(msg);
  }

  assert.equal(violations.length, 0);
});
