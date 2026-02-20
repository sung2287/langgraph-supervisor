/** Intent: PRD-004 SessionStore contract - whitelist-only state, fail-fast verify/load, and atomic save at cycle end. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FileSessionStore,
  SESSION_STATE_REL_PATH,
} from "../../src/session/file_session.store";
import type { SessionState } from "../../src/session/session.types";

function makeTempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "session-store-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function targetPath(repoRoot: string): string {
  return path.join(repoRoot, SESSION_STATE_REL_PATH);
}

function sampleState(hash: string): SessionState {
  return {
    sessionId: "session-1",
    memoryRef: "memory-1",
    repoScanVersion: "scan-v1",
    lastExecutionPlanHash: hash,
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

test("load missing file returns null and boot stage does not create file", () => {
  const repoRoot = makeTempRepo();
  try {
    const store = new FileSessionStore(repoRoot);
    assert.equal(store.load(), null);
    store.verify("hash-a");
    assert.equal(fs.existsSync(targetPath(repoRoot)), false);
  } finally {
    cleanup(repoRoot);
  }
});

test("verify passes when hash matches", () => {
  const repoRoot = makeTempRepo();
  try {
    fs.mkdirSync(path.join(repoRoot, "ops", "runtime"), { recursive: true });
    fs.writeFileSync(
      targetPath(repoRoot),
      `${JSON.stringify(sampleState("hash-a"), null, 2)}\n`,
      "utf8"
    );

    const store = new FileSessionStore(repoRoot);
    store.verify("hash-a");
  } finally {
    cleanup(repoRoot);
  }
});

test("verify fails fast on hash mismatch", () => {
  const repoRoot = makeTempRepo();
  try {
    fs.mkdirSync(path.join(repoRoot, "ops", "runtime"), { recursive: true });
    fs.writeFileSync(
      targetPath(repoRoot),
      `${JSON.stringify(sampleState("hash-a"), null, 2)}\n`,
      "utf8"
    );

    const store = new FileSessionStore(repoRoot);
    assert.throws(() => store.verify("hash-b"), /SESSION_STATE_HASH_MISMATCH/);
  } finally {
    cleanup(repoRoot);
  }
});

test("load fails fast on corrupted JSON", () => {
  const repoRoot = makeTempRepo();
  try {
    fs.mkdirSync(path.join(repoRoot, "ops", "runtime"), { recursive: true });
    fs.writeFileSync(targetPath(repoRoot), "{", "utf8");

    const store = new FileSessionStore(repoRoot);
    assert.throws(() => store.load(), /SESSION_STATE_PARSE_ERROR/);
  } finally {
    cleanup(repoRoot);
  }
});

test("load fails fast when unexpected fields are present", () => {
  const repoRoot = makeTempRepo();
  try {
    fs.mkdirSync(path.join(repoRoot, "ops", "runtime"), { recursive: true });
    fs.writeFileSync(
      targetPath(repoRoot),
      `${JSON.stringify({ ...sampleState("hash-a"), extra: true }, null, 2)}\n`,
      "utf8"
    );

    const store = new FileSessionStore(repoRoot);
    assert.throws(() => store.load(), /SESSION_STATE_VALIDATION_ERROR/);
  } finally {
    cleanup(repoRoot);
  }
});

test("save writes atomically and uses stable key order with updatedAt set by store", () => {
  const repoRoot = makeTempRepo();
  try {
    const store = new FileSessionStore(repoRoot);
    store.save(sampleState("hash-save"));

    const sessionPath = targetPath(repoRoot);
    assert.equal(fs.existsSync(sessionPath), true);

    const serialized = fs.readFileSync(sessionPath, "utf8");
    const parsed = JSON.parse(serialized) as SessionState;

    assert.deepEqual(Object.keys(parsed), [
      "sessionId",
      "memoryRef",
      "repoScanVersion",
      "lastExecutionPlanHash",
      "updatedAt",
    ]);
    assert.equal(parsed.lastExecutionPlanHash, "hash-save");
    assert.equal(Number.isNaN(Date.parse(parsed.updatedAt)), false);
    assert.notEqual(
      parsed.updatedAt,
      "1970-01-01T00:00:00.000Z",
      "updatedAt must be set at save boundary"
    );

    const runtimeDir = path.dirname(sessionPath);
    const tempArtifacts = fs
      .readdirSync(runtimeDir)
      .filter((name) => name.startsWith("session_state.json.tmp-"));
    assert.deepEqual(tempArtifacts, []);

    const ordered = [
      serialized.indexOf('"sessionId"'),
      serialized.indexOf('"memoryRef"'),
      serialized.indexOf('"repoScanVersion"'),
      serialized.indexOf('"lastExecutionPlanHash"'),
      serialized.indexOf('"updatedAt"'),
    ];
    assert.equal(ordered.every((index) => index >= 0), true);
    assert.equal(
      ordered[0]! < ordered[1]! &&
        ordered[1]! < ordered[2]! &&
        ordered[2]! < ordered[3]! &&
        ordered[3]! < ordered[4]!,
      true
    );
  } finally {
    cleanup(repoRoot);
  }
});
