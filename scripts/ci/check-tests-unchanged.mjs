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

const changed = sh(`git diff --name-only ${base}..${head}`);
const files = changed ? changed.split("\n").filter(Boolean) : [];

const touchedTestsDir = files.some((p) => p.startsWith("tests/"));
if (touchedTestsDir) {
  console.error("[GATE FAIL] tests/ directory was modified in this PR.");
  console.error(files.filter((p) => p.startsWith("tests/")).map((x) => `- ${x}`).join("\n"));
  process.exit(1);
}

console.log("[GATE PASS] tests/ untouched.");
