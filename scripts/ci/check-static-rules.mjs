import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["tests", "src"];
const TEST_SUFFIX = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];

// 단순/강력 차단 (우회 어려움은 “금지 + 리뷰”로 커버)
// 필요하면 예외(허용 파일/라인) 목록을 별도로 두고 확장 가능
const RULES = [
  { name: "Date usage", re: /\bnew\s+Date\s*\(|\bDate\s*\./g },
  { name: "Math.random()", re: /\bMath\s*\.\s*random\s*\(/g },
  { name: "fetch()", re: /\bfetch\s*\(/g },
];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const violations = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lower = file.toLowerCase();
    const isTest = TEST_SUFFIX.some((s) => lower.endsWith(s));
    if (!isTest) continue;
    if (![".ts", ".tsx"].includes(extname(lower))) continue;

    const text = readFileSync(file, "utf8");
    for (const rule of RULES) {
      const matches = [...text.matchAll(rule.re)];
      if (matches.length) {
        violations.push({
          file,
          rule: rule.name,
          count: matches.length,
        });
      }
    }
  }
}

if (violations.length) {
  console.error("[FAIL] Static Rules violated in test files:");
  for (const v of violations) {
    console.error(` - ${v.file}: ${v.rule} (${v.count})`);
  }
  process.exit(1);
}
console.log("[PASS] Static Rules OK in all test files.");
