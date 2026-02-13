import fs from "node:fs";

const CAND_STATE = "ops/state_candidates/PROJECT_STATE.next.md";
const CANON_STATE = "docs/MEMORY_Project/PROJECT_STATE.md";

function readNonEmpty(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${p}`);
  const t = fs.readFileSync(p, "utf8");
  if (!t.trim()) throw new Error(`Empty file: ${p}`);
  return t;
}

function main() {
  const cand = readNonEmpty(CAND_STATE);
  const canon = readNonEmpty(CANON_STATE);

  if (canon !== cand) {
    throw new Error(
      `POST-VERIFY FAIL: promoted STATE is not identical to candidate.\n` +
      `- canon: ${CANON_STATE}\n` +
      `- cand : ${CAND_STATE}\n` +
      `Expected: canon === candidate (byte-for-byte) after promote.`
    );
  }

  console.log("OK state:verify");
  console.log("- verified: canon == candidate (STATE) after promote");
}

main();
