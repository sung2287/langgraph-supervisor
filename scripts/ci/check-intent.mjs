import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["tests", "src"];
const TEST_SUFFIX = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];
const INTENT_RE = /^\s*\/\*\*\s*Intent\b[\s\S]*?\*\/\s*/;

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
    // “파일 최상단” 강제: BOM/공백 정도만 허용
    const head = text.replace(/^\uFEFF?/, "");
    if (!INTENT_RE.test(head)) violations.push(file);
  }
}

if (violations.length) {
  console.error("[FAIL] Missing /** Intent ... */ at TOP of test file:");
  for (const v of violations) console.error(" -", v);
  process.exit(1);
}
console.log("[PASS] Intent headers present in all test files.");
