/**
 * Intent: PRD-006/D-006 집행 — Adapter는 Core 구현체를 import 할 수 없고,
 *         오직 core 내부의 ports/dto/errors 등 "정의 파일"만 참조할 수 있다.
 *         위반 시 즉시 FAIL.
 *
 * Policy Type: Structural / Dependency (정적 규칙)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const ADAPTER_ROOT = path.join(PROJECT_ROOT, "src", "adapter");

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

function readText(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function isCodeFile(p: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p);
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/**
 * 금지 규칙 (D-006 준수)
 * - adapter -> core 구현체(service/repository/internal 등) 접근 금지
 */
const FORBIDDEN_IMPORT_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // alias 경로 (src 기준)
  { name: "src/core/**/internal", re: /from\s+["']@?src\/core\/.*\/internal(?:\/.*)?["']/g },
  { name: "src/core/**/repository", re: /from\s+["']@?src\/core\/.*\/repository(?:\/.*)?["']/g },
  { name: "src/core/**/service", re: /from\s+["']@?src\/core\/.*\/service(?:\/.*)?["']/g },

  // 상대경로로 core 구현체를 끌어오는 경우(대략적 차단)
  { name: "relative core/**/internal", re: /from\s+["'][.\/]+core\/.*\/internal(?:\/.*)?["']/g },
  { name: "relative core/**/repository", re: /from\s+["'][.\/]+core\/.*\/repository(?:\/.*)?["']/g },
  { name: "relative core/**/service", re: /from\s+["'][.\/]+core\/.*\/service(?:\/.*)?["']/g },
];

test("PRD-006/D-006: adapter import boundary rules (forbidden imports)", () => {
  // adapter 폴더가 아직 없으면 PASS (스캐폴딩 이전 단계)
  if (!fs.existsSync(ADAPTER_ROOT)) {
    assert.ok(true);
    return;
  }

  const files = listFilesRecursively(ADAPTER_ROOT).filter(isCodeFile);
  const violations: Array<{ file: string; rule: string; excerpt: string }> = [];

  for (const f of files) {
    const txt = readText(f);

    for (const rule of FORBIDDEN_IMPORT_PATTERNS) {
      const matches = txt.match(rule.re);
      if (matches && matches.length > 0) {
        violations.push({
          file: toPosix(path.relative(PROJECT_ROOT, f)),
          rule: rule.name,
          excerpt: matches.slice(0, 3).join("\n"),
        });
      }
    }
  }

  if (violations.length > 0) {
    const msg =
      "\n[PRD-006 VIOLATION] Adapter is importing Core implementation (FORBIDDEN)\n" +
      violations
        .map(
          (v) =>
            `- file: ${v.file}\n  rule: ${v.rule}\n  excerpt:\n  ${v.excerpt
              .split("\n")
              .map((l) => "  " + l)
              .join("\n")}`
        )
        .join("\n\n");
    throw new Error(msg);
  }

  assert.equal(violations.length, 0);
});

// 구현 들어가면 아래 TODO를 실제 테스트로 승격할 것
