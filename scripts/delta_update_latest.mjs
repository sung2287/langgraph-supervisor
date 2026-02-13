import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const LATEST_PATH = "ops/state_delta/latest.json";
const HISTORY_DIR = "ops/state_delta/history";

function parseArgs(argv) {
  const args = [...argv];
  if (args[0] === "--") args.shift();

  const positionals = [];
  let reason = "";
  let requirePass = false;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--reason") {
      reason = args[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (a === "--require-pass") {
      requirePass = true;
      continue;
    }
    positionals.push(a);
  }

  return { prdId: positionals[0] || "", reason, requirePass };
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJsonOrEmpty(p) {
  if (!fs.existsSync(p)) return {};
  const raw = fs.readFileSync(p, "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function writeJsonPretty(p, obj) {
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function runCommand(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  return {
    code: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function runShell(command) {
  const result = spawnSync("bash", ["-lc", command], { encoding: "utf8" });
  return {
    code: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function gitOutput(args, fallback = "") {
  const r = runCommand("git", args);
  if (r.code !== 0) return fallback;
  return r.stdout.trim();
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function detectGitBase(prevLatest) {
  const prevBase = prevLatest?.meta?.git?.base;
  if (typeof prevBase === "string" && prevBase.trim()) {
    const valid = runCommand("git", ["rev-parse", "--verify", prevBase.trim()]);
    if (valid.code === 0) return prevBase.trim();
  }

  const candidates = ["origin/main", "main", "origin/master", "master"];
  for (const c of candidates) {
    const valid = runCommand("git", ["rev-parse", "--verify", c]);
    if (valid.code === 0) return c;
  }

  return "HEAD";
}

function toPassFail(code) {
  return code === 0 ? "PASS" : "FAIL";
}

function nowDeltaId(seed) {
  const d = new Date();
  const y = String(d.getUTCFullYear());
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  const hash8 = sha256(seed).slice(0, 8);
  return `${y}${m}${day}_${hh}${mm}${ss}_${hash8}`;
}

function unionAppend(existing, incoming) {
  const out = [];
  const seen = new Set();
  for (const x of existing) {
    const v = String(x);
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  for (const x of incoming) {
    const v = String(x);
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function main() {
  const { prdId, reason, requirePass } = parseArgs(process.argv.slice(2));
  if (!prdId) throw new Error("Usage: node scripts/delta_update_latest.mjs -- <PRD-ID> --reason \"...\" [--require-pass]");
  if (!reason.trim()) throw new Error("Missing --reason text");

  const latest = readJsonOrEmpty(LATEST_PATH);

  const branch = gitOutput(["rev-parse", "--abbrev-ref", "HEAD"], "UNKNOWN");
  const head = gitOutput(["rev-parse", "HEAD"], "UNKNOWN");
  const headShort = gitOutput(["rev-parse", "--short", "HEAD"], "UNKNOWN");
  const base = detectGitBase(latest);
  const mergeBase = gitOutput(["merge-base", base, head], head);

  const diffRes = runCommand("git", ["diff", "--name-only", `${mergeBase}..${head}`]);
  const changedFiles = diffRes.code === 0
    ? diffRes.stdout
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .sort()
    : [];
  const changedDigest = sha256(changedFiles.join("\n"));

  const typecheckRes = runShell("npm run -s typecheck");
  const testRes = runShell("npm test --silent");

  if (requirePass && (typecheckRes.code !== 0 || testRes.code !== 0)) {
    throw new Error(
      [
        "--require-pass enabled; build checks failed.",
        `- typecheck_exit_code: ${typecheckRes.code}`,
        `- test_exit_code: ${testRes.code}`,
        "Aborting without writing latest/history."
      ].join("\n")
    );
  }

  const generatedAt = new Date().toISOString();
  const deltaId = nowDeltaId(
    JSON.stringify({ prdId, reason, base, head, mergeBase, changedDigest, tc: typecheckRes.code, te: testRes.code })
  );

  const existingDone = Array.isArray(latest?.scope?.prd_done_add) ? latest.scope.prd_done_add : [];
  const accumulatedDone = unionAppend(existingDone, [prdId]);

  const meta = {
    update_reason: reason,
    git: {
      base,
      merge_base: mergeBase,
      head,
      head_short: headShort,
      branch
    },
    evidence_digest: {
      changed_files_sha256: changedDigest,
      typecheck_exit_code: typecheckRes.code,
      test_exit_code: testRes.code
    }
  };

  const build = {
    typecheck: toPassFail(typecheckRes.code),
    test: toPassFail(testRes.code)
  };

  const latestNext = {
    ...latest,
    delta_id: deltaId,
    generated_at: generatedAt,
    meta,
    build,
    scope: {
      ...(latest.scope && typeof latest.scope === "object" ? latest.scope : {}),
      prd_done_add: accumulatedDone
    }
  };

  const historyEvent = {
    delta_id: deltaId,
    generated_at: generatedAt,
    scope: {
      prd_done_add: [prdId]
    },
    meta,
    build
  };

  ensureDir(path.dirname(LATEST_PATH));
  ensureDir(HISTORY_DIR);

  writeJsonPretty(LATEST_PATH, latestNext);
  writeJsonPretty(path.join(HISTORY_DIR, `${deltaId}.json`), historyEvent);

  console.log("OK delta:update");
  console.log(`- prd_id: ${prdId}`);
  console.log(`- delta_id: ${deltaId}`);
  console.log(`- latest: ${LATEST_PATH}`);
  console.log(`- history: ${path.join(HISTORY_DIR, `${deltaId}.json`)}`);
  console.log(`- typecheck_exit_code: ${typecheckRes.code}`);
  console.log(`- test_exit_code: ${testRes.code}`);
}

main();
