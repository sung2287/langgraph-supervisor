import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const CAND_STATE = "ops/state_candidates/PROJECT_STATE.next.md";
const CAND_STATUS = "ops/state_candidates/PROJECT_STATUS.next.md";

const CANON_STATE = "docs/MEMORY_Project/PROJECT_STATE.md";

const STATE_HISTORY_DIR = "docs/MEMORY_Project/state_history";
const STATUS_DIR = "docs/MEMORY_Project/status";

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function stamp() {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}_${hh}${mm}${ss}`;
}

function readNonEmpty(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing candidate: ${p}`);
  const t = fs.readFileSync(p, "utf8");
  if (!t.trim()) throw new Error(`Empty candidate: ${p}`);
  return t;
}

function backupStateIfExists() {
  if (!fs.existsSync(CANON_STATE)) return;
  const prev = fs.readFileSync(CANON_STATE, "utf8");
  const backupPath = path.join(STATE_HISTORY_DIR, `PROJECT_STATE_${stamp()}.md`);
  fs.writeFileSync(backupPath, prev, "utf8");
  console.log(`- backup: ${backupPath}`);
}

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  // ─────────────────────────
  // (A) Pre-Validate: meaning / delta 검증
  // ─────────────────────────
  run("node scripts/state_validate_candidate.mjs");

  // ─────────────────────────
  // (B) Promote 실행
  // ─────────────────────────
  const nextState = readNonEmpty(CAND_STATE);
  const nextStatus = readNonEmpty(CAND_STATUS);

  ensureDir(STATE_HISTORY_DIR);
  ensureDir(STATUS_DIR);

  backupStateIfExists();
  fs.writeFileSync(CANON_STATE, nextState, "utf8");
  console.log(`- promoted: ${CANON_STATE}`);

  const statusPath = path.join(STATUS_DIR, `PROJECT_STATUS_${stamp()}.md`);
  fs.writeFileSync(statusPath, nextStatus, "utf8");
  console.log(`- appended: ${statusPath}`);

  // ─────────────────────────
  // (C) Post-Verify: promote 결과 검증
  // ─────────────────────────
  run("node scripts/state_verify_promoted.mjs");

  console.log("OK state:promote");
}

main();
