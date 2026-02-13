import fs from "node:fs";
import path from "node:path";

const CORE_ROOT = path.join(process.cwd(), "src", "core");
const SSOT_FILE = path.join(CORE_ROOT, "errors", "canonical_error_codes.ts");
const ERROR_CODE_LITERAL_RE = /(["'])(E_CORE_[A-Z_]+|E_ADAPTER_[A-Z_]+|E_INTERNAL_ERROR|E_CONTRACT_MISMATCH)\1/g;
const ERROR_CODE_CAST_RE = /\bas\s+ErrorCode\b/g;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(next));
      continue;
    }
    if (entry.isFile() && next.endsWith(".ts")) {
      out.push(next);
    }
  }
  return out;
}

function lineAt(text, idx) {
  return text.slice(0, idx).split(/\r?\n/).length;
}

const violations = [];
const files = walk(CORE_ROOT);

for (const file of files) {
  if (path.resolve(file) === path.resolve(SSOT_FILE)) continue;
  const text = fs.readFileSync(file, "utf8");

  for (const m of text.matchAll(ERROR_CODE_LITERAL_RE)) {
    violations.push({
      file: path.relative(process.cwd(), file),
      line: lineAt(text, m.index ?? 0),
      reason: `Hardcoded error-code literal ${m[0]} is forbidden in src/core/** (use canonical_error_codes.ts).`,
    });
  }

  for (const m of text.matchAll(ERROR_CODE_CAST_RE)) {
    violations.push({
      file: path.relative(process.cwd(), file),
      line: lineAt(text, m.index ?? 0),
      reason: "Casting to ErrorCode is forbidden in src/core/**.",
    });
  }
}

if (violations.length > 0) {
  console.error("[FAIL] PRD-008 guardrail violations:");
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} ${v.reason}`);
  }
  process.exit(1);
}

console.log("[PASS] PRD-008 error code literal guardrails.");
