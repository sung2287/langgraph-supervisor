import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

const base = process.env.GITHUB_BASE_SHA;
const head = process.env.GITHUB_HEAD_SHA;

if (!base || !head) {
  console.error("[GATE] Missing GITHUB_BASE_SHA / GITHUB_HEAD_SHA");
  process.exit(2);
}

// PR에서 변경된 테스트만 검사
const changed = sh(`git diff --name-only ${base}..${head}`);
const files = (changed ? changed.split("\n") : [])
  .filter(Boolean)
  .filter((p) => p.endsWith(".test.ts"));

if (files.length === 0) {
  console.log("[GATE PASS] No changed *.test.ts files.");
  process.exit(0);
}

const failures = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");

  // --- Intent header check ---
  // 파일 맨 앞의 공백/개행만 허용하고 바로 /** Intent 로 시작해야 함
  const leading = text.replace(/^\uFEFF?/, ""); // BOM 제거
  const trimmedLead = leading.replace(/^[\s\r\n]*/, "");
  if (!trimmedLead.startsWith("/** Intent")) {
    failures.push({
      file,
      reason: "Missing required top-of-file `/** Intent ... */` header.",
      hint: "Put `/** Intent ... */` as the very first content in the file (only whitespace/newlines allowed before it).",
    });
  }

  // --- Banned APIs in tests ---
  // NOTE: /g 플래그 제거 (RegExp.test 반복 호출 lastIndex 이슈 방지)
  const banned = [
    { name: "Date.now", re: /\bDate\.now\s*\(/ },
    { name: "Math.random", re: /\bMath\.random\s*\(/ },
    // fetch / network (광범위하게 막기)
    { name: "fetch", re: /\bfetch\s*\(/ },
    { name: "http(s) URL literal", re: /https?:\/\/[^\s'"]+/ },
    { name: "undici.request", re: /\bundici\s*\.\s*request\s*\(/ },
    { name: "node:http", re: /\bfrom\s+['"]node:http['"]|\brequire\s*\(\s*['"]node:http['"]\s*\)/ },
    { name: "node:https", re: /\bfrom\s+['"]node:https['"]|\brequire\s*\(\s*['"]node:https['"]\s*\)/ },
  ];

  for (const b of banned) {
    if (b.re.test(text)) {
      failures.push({
        file,
        reason: `Banned API used in test: ${b.name}`,
        hint: "Use deterministic injection/mocks. No time/random/network in tests.",
      });
    }
  }
}

if (failures.length) {
  console.error("[GATE FAIL] Test governance violation(s):");
  for (const f of failures) {
    console.error(`\n- ${f.file}\n  - ${f.reason}\n  - ${f.hint}`);
  }
  process.exit(1);
}

console.log("[GATE PASS] Intent header + banned API checks OK.");
