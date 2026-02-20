/** Intent: PRD-001 neutrality lock — core graph/executor source must not include profile or domain literals. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CORE_FILES = [
  "src/core/plan/plan.types.ts",
  "src/core/plan/step.registry.ts",
  "src/core/plan/plan.handlers.ts",
  "src/core/plan/plan.executor.ts",
  "runtime/graph/graph.ts",
];
const BANNED = ["default", "coding", "review", "diagnose", "implement"];

test("T3: core files do not reference profile names or domain literals", () => {
  const violations: Array<{ file: string; term: string }> = [];

  for (const relPath of CORE_FILES) {
    const absPath = path.join(ROOT, relPath);
    const text = fs.readFileSync(absPath, "utf8");

    for (const term of BANNED) {
      const re = new RegExp(`\\b${term}\\b`, "i");
      if (re.test(text)) {
        violations.push({ file: relPath, term });
      }
    }
  }

  if (violations.length > 0) {
    const message = violations
      .map((v) => `${v.file} -> ${v.term}`)
      .join("\n");
    assert.fail(`Found banned literals in core files:\n${message}`);
  }

  assert.equal(violations.length, 0);
});
