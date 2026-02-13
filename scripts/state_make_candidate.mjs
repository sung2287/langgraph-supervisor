import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PROJECT_STATE_CANON = "docs/MEMORY_Project/PROJECT_STATE.md";

// 입력
const DELTA_PATH = "ops/state_delta/latest.json";
const MEANING_PATH = "ops/state_delta/meaning.json"; // 시니어가 채울 파일(스텁은 코드가 생성)

// 출력
const OUT_DIR = "ops/state_candidates";
const OUT_STATE = path.join(OUT_DIR, "PROJECT_STATE.next.md");
const OUT_STATUS = path.join(OUT_DIR, "PROJECT_STATUS.next.md");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readTextIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function readJsonOrEmpty(p) {
  if (!fs.existsSync(p)) return {};
  const raw = fs.readFileSync(p, "utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`JSON parse failed: ${p}`);
  }
}

function writeJsonPretty(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function nowStampDate() {
  // YYYY-MM-DD
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function patchLastUpdated(md, dateStr) {
  const re = /^- last_updated:\s*.*$/m;
  if (re.test(md)) return md.replace(re, `- last_updated: ${dateStr}`);
  throw new Error("PROJECT_STATE missing '- last_updated:' line");
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPath(obj, parts) {
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function formatStateValue(v) {
  if (Array.isArray(v)) return `[${v.map((x) => String(x)).join(", ")}]`;
  return String(v);
}

function isMissingValue(v) {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function upsertStateLine(md, key, valueText) {
  const line = `- ${key}: ${valueText}`;
  const keyRe = new RegExp(`^- ${escapeRegExp(key)}:.*$`, "gm");

  if (keyRe.test(md)) {
    return md.replace(keyRe, line);
  }

  const metaHeaderRe = /^## Meta\b.*$/m;
  const metaMatch = md.match(metaHeaderRe);
  if (!metaMatch || metaMatch.index === undefined) throw new Error("PROJECT_STATE missing '## Meta' section");

  const metaHeaderIdx = metaMatch.index;
  const metaBodyStart = md.indexOf("\n", metaHeaderIdx);
  if (metaBodyStart < 0) {
    return `${md}\n${line}\n`;
  }

  const afterMetaHeader = metaBodyStart + 1;
  const rest = md.slice(afterMetaHeader);
  const nextHeaderMatch = rest.match(/^##\s+/m);
  const metaEnd = nextHeaderMatch && nextHeaderMatch.index !== undefined ? afterMetaHeader + nextHeaderMatch.index : md.length;
  const metaBlock = md.slice(afterMetaHeader, metaEnd);

  const bulletRe = /^- .*$/gm;
  let bullet;
  let lastBulletEnd = -1;
  while ((bullet = bulletRe.exec(metaBlock)) !== null) {
    lastBulletEnd = bulletRe.lastIndex;
  }

  if (lastBulletEnd >= 0) {
    const insertAt = afterMetaHeader + lastBulletEnd;
    return `${md.slice(0, insertAt)}\n${line}${md.slice(insertAt)}`;
  }

  return `${md.slice(0, afterMetaHeader)}${line}\n${md.slice(afterMetaHeader)}`;
}

function asBullets(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "- (none)";
  return arr.map((x) => `- ${String(x)}`).join("\n");
}

/**
 * delta_id 발급 규칙:
 * - 델타 JSON 원문(파일 전체)을 SHA256 해시 -> 앞 8자 사용
 * - 날짜/시간 + hash8 조합
 *
 * 장점: 델타 내용이 조금이라도 바뀌면 delta_id가 바뀜(= meaning 재작성 강제)
 */
function ensureDeltaId(deltaRawText, deltaObj) {
  if (typeof deltaObj.delta_id === "string" && deltaObj.delta_id.trim()) {
    return deltaObj.delta_id.trim();
  }
  const hash8 = crypto.createHash("sha256").update(deltaRawText).digest("hex").slice(0, 8);

  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return `${y}${m}${day}_${hh}${mm}${ss}_${hash8}`;
}

function buildMeaningStub(deltaId) {
  return {
    _note: "DO NOT CHANGE delta_id. Fill human meaning only.",
    delta_id: deltaId,
    one_liner: "",
    context: [],
    decisions: [],
    not_decided: [],
    rationale: [],
    problems: [],
    risks: [],
    next_actions: [],
    definition_of_done: []
  };
}

function main() {
  ensureDir(OUT_DIR);
  ensureDir(path.dirname(DELTA_PATH));
  ensureDir(path.dirname(MEANING_PATH));

  // 1) DELTA 로드(원문 + 객체)
  if (!fs.existsSync(DELTA_PATH)) throw new Error(`Missing DELTA: ${DELTA_PATH}`);
  const deltaRaw = fs.readFileSync(DELTA_PATH, "utf8");
  const delta = deltaRaw.trim() ? JSON.parse(deltaRaw) : {};
  if (typeof delta !== "object" || delta === null) throw new Error("DELTA must be a JSON object");

  // 2) delta_id 보장(없으면 델타 파일 자체에 기록)
  const deltaId = ensureDeltaId(deltaRaw, delta);
  if (delta.delta_id !== deltaId) {
    delta.delta_id = deltaId;
    if (!delta.generated_at) delta.generated_at = new Date().toISOString();
    writeJsonPretty(DELTA_PATH, delta);
    console.log(`- wrote delta_id into DELTA: ${deltaId}`);
  } else {
    console.log(`- delta_id: ${deltaId}`);
  }

  // 3) meaning 스텁 자동 생성/갱신
  const meaning = readJsonOrEmpty(MEANING_PATH);
  const meaningDeltaId = typeof meaning.delta_id === "string" ? meaning.delta_id.trim() : "";

  if (!meaningDeltaId || meaningDeltaId !== deltaId) {
    const stub = buildMeaningStub(deltaId);
    writeJsonPretty(MEANING_PATH, stub);
    console.log(`- (re)generated MEANING stub: ${MEANING_PATH}`);
    console.log("  -> senior fills meaning fields, then re-run state:cycle/validate.");
  } else {
    console.log(`- meaning matches delta_id: ${meaningDeltaId}`);
  }

  // 4) PROJECT_STATE.next 생성 (형식 불변, last_updated + delta-driven key upsert)
  const base = readTextIfExists(PROJECT_STATE_CANON);
  if (!base.trim()) throw new Error(`Missing canonical PROJECT_STATE: ${PROJECT_STATE_CANON}`);
  let nextState = patchLastUpdated(base, nowStampDate());

  const stateMappings = [
    { key: "prd_done", path: ["scope", "prd_done_add"] },
    { key: "latest_delta_id", path: ["delta_id"] },
    { key: "git_base", path: ["meta", "git", "base"] },
    { key: "git_merge_base", path: ["meta", "git", "merge_base"] },
    { key: "git_head", path: ["meta", "git", "head"] },
    { key: "git_head_short", path: ["meta", "git", "head_short"] },
    { key: "git_branch", path: ["meta", "git", "branch"] },
    { key: "changed_files_sha256", path: ["meta", "evidence_digest", "changed_files_sha256"] },
    { key: "typecheck", path: ["build", "typecheck"] },
    { key: "test", path: ["build", "test"] },
    { key: "typecheck_exit_code", path: ["meta", "evidence_digest", "typecheck_exit_code"] },
    { key: "test_exit_code", path: ["meta", "evidence_digest", "test_exit_code"] },
    { key: "update_reason", path: ["meta", "update_reason"] }
  ];

  for (const m of stateMappings) {
    const rawVal = getPath(delta, m.path);
    if (isMissingValue(rawVal)) continue;
    nextState = upsertStateLine(nextState, m.key, formatStateValue(rawVal));
  }

  // 5) PROJECT_STATUS.next 생성 (DELTA + MEANING)
  const meaning2 = readJsonOrEmpty(MEANING_PATH); // 갱신 후 재로드
  const generatedAt = new Date().toISOString();

  const oneLiner =
    typeof meaning2.one_liner === "string" && meaning2.one_liner.trim()
      ? meaning2.one_liner.trim()
      : "TODO: one_liner (human)";

  const context =
    Array.isArray(meaning2.context) && meaning2.context.length ? asBullets(meaning2.context) : "- TODO: context (human)";

  const decisions =
    Array.isArray(meaning2.decisions) && meaning2.decisions.length ? asBullets(meaning2.decisions) : "- TODO: decisions (human)";

  const notDecided =
    Array.isArray(meaning2.not_decided) && meaning2.not_decided.length ? asBullets(meaning2.not_decided) : "- (none)";

  const rationale =
    Array.isArray(meaning2.rationale) && meaning2.rationale.length ? asBullets(meaning2.rationale) : "- TODO: rationale (human)";

  const problems =
    Array.isArray(meaning2.problems) && meaning2.problems.length ? asBullets(meaning2.problems) : "- (none)";

  const risks =
    Array.isArray(meaning2.risks) && meaning2.risks.length ? asBullets(meaning2.risks) : "- (none)";

  const nextActions =
    Array.isArray(meaning2.next_actions) && meaning2.next_actions.length ? asBullets(meaning2.next_actions) : "- TODO: next_actions (human)";

  const dod =
    Array.isArray(meaning2.definition_of_done) && meaning2.definition_of_done.length
      ? asBullets(meaning2.definition_of_done)
      : "- TODO: definition_of_done (human)";

  const deltaKeys = Object.keys(delta || {});
  const deltaKeyLine = deltaKeys.length ? deltaKeys.join(", ") : "(none)";

  const statusMd = [
    "# PROJECT_STATUS (DAILY LOG)",
    "",
    "## Meta (Auto)",
    `- generated_at: ${generatedAt}`,
    `- local_date: ${nowStampDate()}`,
    `- delta_id: ${deltaId}`,
    "- mode: draft-from-delta+meaning",
    "",
    "## Inputs (Auto)",
    `- delta_source: ${DELTA_PATH}`,
    `- delta_keys: ${deltaKeyLine}`,
    `- meaning_source: ${MEANING_PATH}`,
    "",
    "## What Happened Today (Human)",
    `- one_liner: ${oneLiner}`,
    "",
    "### context",
    context,
    "",
    "## Decisions (Human)",
    "### decided",
    decisions,
    "",
    "### not_decided",
    notDecided,
    "",
    "### rationale",
    rationale,
    "",
    "## Problems / Risks (Human)",
    "### problems",
    problems,
    "",
    "### risks",
    risks,
    "",
    "## Next (Human)",
    "### next_actions",
    nextActions,
    "",
    "### definition_of_done",
    dod,
    ""
  ].join("\n");

  fs.writeFileSync(OUT_STATE, nextState, "utf8");
  fs.writeFileSync(OUT_STATUS, statusMd, "utf8");

  console.log("OK state:cycle");
  console.log(`- wrote: ${OUT_STATE}`);
  console.log(`- wrote: ${OUT_STATUS}`);
}

main();
