import { execSync } from "node:child_process";

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
}

// PR 기준 diff: GitHub Actions에서 base/head 제공됨
const base = process.env.GITHUB_BASE_REF;
const head = process.env.GITHUB_HEAD_REF;

let diffCmd = "git diff --name-only HEAD~1..HEAD";
if (base && head) diffCmd = `git diff --name-only origin/${base}...HEAD`;

const files = sh(diffCmd).split("\n").map(s => s.trim()).filter(Boolean);

const touched = files.filter((p) =>
  p.startsWith("tests/") ||
  p.endsWith(".test.ts") || p.endsWith(".spec.ts") ||
  p.endsWith(".test.tsx") || p.endsWith(".spec.tsx")
);

if (touched.length) {
  console.error("[HOLD] Test files changed. Manual review required:");
  for (const t of touched) console.error(" -", t);
  process.exit(1); // “자동 HOLD”를 CI fail로 구현
}

console.log("[PASS] No test file changes detected.");
