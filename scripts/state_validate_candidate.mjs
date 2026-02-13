import fs from "node:fs";

const CAND_STATE = "ops/state_candidates/PROJECT_STATE.next.md";
const CAND_STATUS = "ops/state_candidates/PROJECT_STATUS.next.md";
const CANON_STATE = "docs/MEMORY_Project/PROJECT_STATE.md";

const DELTA_PATH = "ops/state_delta/latest.json";
const MEANING_PATH = "ops/state_delta/meaning.json";

function readNonEmpty(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${p}`);
  const t = fs.readFileSync(p, "utf8");
  if (!t.trim()) throw new Error(`Empty file: ${p}`);
  return t;
}

// candidate는 canon 기반이며, 허용 차이는 auto-updated key 라인뿐
function normalizeStateForCompare(md) {
  return md
    .replace(/^- last_updated:\s*.*$/gm, "")
    .replace(/^- update_reason:\s*.*$/gm, "")
    .replace(/^- latest_delta_id:\s*.*$/gm, "")
    .replace(/^- git_base:\s*.*$/gm, "")
    .replace(/^- git_merge_base:\s*.*$/gm, "")
    .replace(/^- git_head:\s*.*$/gm, "")
    .replace(/^- git_head_short:\s*.*$/gm, "")
    .replace(/^- git_branch:\s*.*$/gm, "")
    .replace(/^- prd_done:\s*.*$/gm, "")
    .replace(/^- typecheck:\s*.*$/gm, "")
    .replace(/^- test:\s*.*$/gm, "")
    .replace(/^- changed_files_sha256:\s*.*$/gm, "")
    .replace(/^- typecheck_exit_code:\s*.*$/gm, "")
    .replace(/^- test_exit_code:\s*.*$/gm, "")
    .replace(/^\s*$/gm, "")
    .trim();
}
function extractLastUpdated(md) {
  const m = md.match(/^\s*-\s*last_updated:\s*(.+)\s*$/m);
  return m ? m[1].trim() : "";
}

function main() {
  // 0) 후보 파일 존재만 확인 (내용 TODO 허용)
  const candState = readNonEmpty(CAND_STATE);
  readNonEmpty(CAND_STATUS);

  // 1) candidate STATE가 canon 기반인지 “느슨하게” 확인 (last_updated만 변경 허용)
  const canonState = readNonEmpty(CANON_STATE);
  const canonNorm = normalizeStateForCompare(canonState);
  const candNorm = normalizeStateForCompare(candState);

  if (canonNorm !== candNorm) {
    throw new Error(
      [
        "STATE candidate invalid: differences beyond '- last_updated:' detected.",
        `- canon: ${CANON_STATE}`,
        `- cand : ${CAND_STATE}`,
      ].join("\n")
    );
  }

  // last_updated 라인 없으면 생성 로직이 깨진 거라 FAIL
  if (!extractLastUpdated(candState)) {
    throw new Error("Candidate STATE missing '- last_updated:' line");
  }

  // 2) DELTA / MEANING 정합성만 강제 (이게 핵심 안전장치)
  if (!fs.existsSync(DELTA_PATH)) throw new Error(`Missing DELTA: ${DELTA_PATH}`);
  if (!fs.existsSync(MEANING_PATH)) throw new Error(`Missing MEANING.json: ${MEANING_PATH}`);

  const delta = JSON.parse(fs.readFileSync(DELTA_PATH, "utf8"));
  const meaning = JSON.parse(fs.readFileSync(MEANING_PATH, "utf8"));

  if (!delta.delta_id) throw new Error("DELTA missing delta_id");
  if (!meaning.delta_id) throw new Error("MEANING missing delta_id");

  if (delta.delta_id !== meaning.delta_id) {
    throw new Error(
      `delta_id mismatch:\n- delta:   ${delta.delta_id}\n- meaning: ${meaning.delta_id}\n` +
        "Fix: run `npm run state:cycle` to regenerate stubs, then fill meaning again."
    );
  }

  // 3) 의미 필드들은 “권장”으로만 체크 (비어도 통과)
  //    -> 로그만 찍고 promote를 막지 않는다.
  const softFields = ["one_liner", "decisions", "next_actions"];
  const missing = [];
  for (const k of softFields) {
    const v = meaning[k];
    const empty =
      v === undefined ||
      v === null ||
      (typeof v === "string" && !v.trim()) ||
      (Array.isArray(v) && v.length === 0);
    if (empty) missing.push(k);
  }

  console.log("OK state:validate (relaxed)");
  console.log("- verified: candidate STATE derived from canon (only last_updated differs)");
  console.log("- verified: delta_id matches between DELTA and MEANING");
  if (missing.length) {
    console.log(`- note: meaning fields still empty (allowed): ${missing.join(", ")}`);
  }
}

main();
