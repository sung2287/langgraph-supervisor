/**
 * Intent: PRD-016 session panel lock — list/switch/delete must enforce namespace authority, file-backed source-of-truth, and rename-only collision-safe deletion.
 * Scope: LocalWebRuntimeAdapter web session management APIs for list overlay, switch validation order, and delete rotation behavior.
 * Non-Goals: runRuntimeOnce graph execution, SSE transport, or React UI rendering.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalWebRuntimeAdapter, WebSessionApiError } from "../../../src/adapters/web/web.runtime_adapter";
import { buildWebSessionFilename } from "../../../runtime/orchestrator/session_namespace";
import { WebSessionMetadataStore } from "../../../runtime/web/session_metadata.store";

const RUNTIME_REL_DIR = path.join("ops", "runtime");

function makeTempRepo(t: test.TestContext): string {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "web-session-adapter-"));
  fs.mkdirSync(path.join(repoRoot, RUNTIME_REL_DIR), { recursive: true });
  t.after(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });
  return repoRoot;
}

function writeWebSessionFile(repoRoot: string, sessionId: string): string {
  const filename = buildWebSessionFilename(sessionId);
  const absolutePath = path.join(repoRoot, RUNTIME_REL_DIR, filename);
  fs.writeFileSync(absolutePath, "{}\n", "utf8");
  return absolutePath;
}

test("listWebSessions: overlays metadata, excludes meta-only rows, and falls back to file mtime", async (t) => {
  const repoRoot = makeTempRepo(t);
  const alphaPath = writeWebSessionFile(repoRoot, "web.alpha");
  const betaPath = writeWebSessionFile(repoRoot, "web.beta");
  const now = Date.now();
  fs.utimesSync(betaPath, new Date(now - 30_000), new Date(now - 30_000));

  const metadataStore = new WebSessionMetadataStore({ baseDir: repoRoot });
  await metadataStore.upsertPreview("web.alpha", "alpha-preview", now + 10_000);
  await metadataStore.upsertPreview("web.ghost", "ghost-preview", now + 20_000);
  await metadataStore.flush();

  const adapter = new LocalWebRuntimeAdapter({
    repoPath: repoRoot,
    metadataStore,
    getSessionSnapshot: () => ({ exists: false, state: null }),
  });
  await adapter.initWebSession("web.alpha");

  const sessions = await adapter.listWebSessions("web.alpha");
  const sessionIds = sessions.map((item) => item.sessionId);
  assert.deepEqual(sessionIds, ["web.alpha", "web.beta"]);
  assert.equal(sessions[0]?.isActive, true);
  assert.equal(sessions[0]?.lastUserMessagePreview, "alpha-preview");
  assert.equal(sessions.some((item) => item.sessionId === "web.ghost"), false);

  const beta = sessions.find((item) => item.sessionId === "web.beta");
  assert.ok(beta);
  assert.equal(beta.lastUserMessagePreview, undefined);
  const betaMtime = fs.statSync(betaPath).mtimeMs;
  assert.equal(Math.round(beta.lastUpdatedAt), Math.round(betaMtime));
  assert.equal(fs.existsSync(alphaPath), true);
});

test("switchWebSession: validation order is namespace first, then existence check", async (t) => {
  const repoRoot = makeTempRepo(t);
  const metadataStore = new WebSessionMetadataStore({ baseDir: repoRoot });
  const adapter = new LocalWebRuntimeAdapter({
    repoPath: repoRoot,
    metadataStore,
    getSessionSnapshot: () => ({ exists: false, state: null }),
  });

  await assert.rejects(
    () => adapter.switchWebSession("alpha"),
    (error: unknown) => {
      assert.equal(error instanceof WebSessionApiError, true);
      const typed = error as WebSessionApiError;
      assert.equal(typed.statusCode, 403);
      assert.equal(typed.errorCode, "FORBIDDEN");
      return true;
    }
  );

  await assert.rejects(
    () => adapter.switchWebSession("web.missing"),
    (error: unknown) => {
      assert.equal(error instanceof WebSessionApiError, true);
      const typed = error as WebSessionApiError;
      assert.equal(typed.statusCode, 404);
      assert.equal(typed.errorCode, "SESSION_NOT_FOUND");
      return true;
    }
  );
});

test("deleteWebSession: collision on _bak adds UTC suffix and does not overwrite", async (t) => {
  const repoRoot = makeTempRepo(t);
  const sourcePath = writeWebSessionFile(repoRoot, "web.alpha");
  const baseBackupPath = `${sourcePath}_bak`;
  fs.writeFileSync(baseBackupPath, "existing-backup", "utf8");

  const metadataStore = new WebSessionMetadataStore({ baseDir: repoRoot });
  await metadataStore.upsertPreview("web.alpha", "to-delete", 100);
  await metadataStore.flush();

  const adapter = new LocalWebRuntimeAdapter({
    repoPath: repoRoot,
    metadataStore,
    getSessionSnapshot: () => ({ exists: false, state: null }),
  });
  await adapter.initWebSession("web.alpha");

  const result = await adapter.deleteWebSession("web.alpha");
  assert.equal(result.deletedSessionId, "web.alpha");
  assert.equal(typeof result.newActiveSessionId, "string");
  assert.equal(fs.existsSync(sourcePath), false);
  assert.equal(fs.readFileSync(baseBackupPath, "utf8"), "existing-backup");

  const dir = path.dirname(sourcePath);
  const baseName = path.basename(baseBackupPath);
  const rotated = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(`${baseName}.`));
  assert.equal(rotated.length >= 1, true);

  const metadata = metadataStore.readAll();
  assert.equal("web.alpha" in metadata.sessions, false);
});
