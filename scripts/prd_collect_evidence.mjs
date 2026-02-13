import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const EVIDENCE_ROOT = "ops/evidence";

function parseArgs(argv) {
  const args = [...argv];
  if (args[0] === "--") args.shift();
  return { prdId: args[0] || "" };
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeText(p, t) {
  fs.writeFileSync(p, t, "utf8");
}

function runCommand(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  return {
    code: typeof res.status === "number" ? res.status : 1,
    stdout: res.stdout || "",
    stderr: res.stderr || ""
  };
}

function runShell(command) {
  const res = spawnSync("bash", ["-lc", command], { encoding: "utf8" });
  return {
    code: typeof res.status === "number" ? res.status : 1,
    stdout: res.stdout || "",
    stderr: res.stderr || ""
  };
}

function gitOutput(args, fallback = "") {
  const r = runCommand("git", args);
  if (r.code !== 0) return fallback;
  return r.stdout.trim();
}

function main() {
  const { prdId } = parseArgs(process.argv.slice(2));
  if (!prdId) throw new Error("Usage: node scripts/prd_collect_evidence.mjs -- <PRD-ID>");

  const timestamp = new Date().toISOString();
  const outDir = path.join(EVIDENCE_ROOT, prdId, timestamp);
  ensureDir(outDir);

  const branch = gitOutput(["rev-parse", "--abbrev-ref", "HEAD"], "UNKNOWN");
  const head = gitOutput(["rev-parse", "HEAD"], "UNKNOWN");

  const baseCandidates = ["origin/main", "main", "origin/master", "master", "HEAD"];
  let base = "HEAD";
  for (const c of baseCandidates) {
    const ok = runCommand("git", ["rev-parse", "--verify", c]);
    if (ok.code === 0) {
      base = c;
      break;
    }
  }

  const mergeBase = gitOutput(["merge-base", base, head], head);
  const changed = runCommand("git", ["diff", "--name-only", `${mergeBase}..${head}`]);

  const typecheck = runShell("npm run -s typecheck");
  const test = runShell("npm test --silent");

  writeText(
    path.join(outDir, "git_info.json"),
    `${JSON.stringify({ branch, head, base, merge_base: mergeBase }, null, 2)}\n`
  );
  writeText(path.join(outDir, "changed_files.txt"), changed.stdout);
  writeText(path.join(outDir, "typecheck.stdout.log"), typecheck.stdout);
  writeText(path.join(outDir, "typecheck.stderr.log"), typecheck.stderr);
  writeText(path.join(outDir, "test.stdout.log"), test.stdout);
  writeText(path.join(outDir, "test.stderr.log"), test.stderr);
  writeText(
    path.join(outDir, "exit_codes.json"),
    `${JSON.stringify({ typecheck_exit_code: typecheck.code, test_exit_code: test.code }, null, 2)}\n`
  );

  console.log("OK prd:evidence");
  console.log(`- prd_id: ${prdId}`);
  console.log(`- output_dir: ${outDir}`);
  console.log(`- branch: ${branch}`);
  console.log(`- head: ${head}`);
  console.log(`- merge_base: ${mergeBase}`);
  console.log(`- typecheck_exit_code: ${typecheck.code}`);
  console.log(`- test_exit_code: ${test.code}`);
}

main();
// scripts/prd_collect_evidence.mjs
import { execSync } from "node:child_process";
