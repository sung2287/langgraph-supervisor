/**
 * Intent: PRD-016 metadata store lock — preview metadata must be atomic(tmp+rename), serialized, and length-bounded without touching session_state schema.
 * Scope: runtime/web/session_metadata.store.ts read/write behavior and queue serialization.
 * Non-Goals: Web adapter routing, session namespace authorization, or UI rendering behavior.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSessionMetadataStore } from "../../../runtime/web/session_metadata.store";

function makeTempRepo(t: test.TestContext): string {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "web-meta-store-"));
  t.after(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });
  return repoRoot;
}

function makeEnoent(pathname: string): NodeJS.ErrnoException {
  const error = new Error(`ENOENT: no such file or directory, open '${pathname}'`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}

test("upsertPreview: trims preview to first 50 chars and normalizes newlines", async (t) => {
  const repoRoot = makeTempRepo(t);
  const store = new WebSessionMetadataStore({ baseDir: repoRoot });
  const raw = "line-1\nline-2\nline-3 this is a very long preview that exceeds fifty chars";

  await store.upsertPreview("web.default", raw, 1000);
  await store.flush();

  const loaded = store.readAll();
  const entry = loaded.sessions["web.default"];
  assert.ok(entry);
  assert.equal(entry.lastUpdatedAt, 1000);
  assert.equal(entry.lastUserMessagePreview?.includes("\n"), false);
  assert.equal(entry.lastUserMessagePreview?.length, 50);
});

test("atomic write: metadata uses tmp file then rename", async () => {
  const writes: Array<{ path: string; data: string }> = [];
  const renames: Array<{ from: string; to: string }> = [];
  const fileMap = new Map<string, string>();

  const store = new WebSessionMetadataStore({
    baseDir: "/repo",
    fsImpl: {
      readFileSync: (pathname: string) => {
        const value = fileMap.get(pathname);
        if (typeof value !== "string") {
          throw makeEnoent(pathname);
        }
        return value;
      },
      writeFileSync: (pathname: string, data: string) => {
        writes.push({ path: pathname, data });
        fileMap.set(pathname, data);
      },
      renameSync: (oldPath: string, newPath: string) => {
        renames.push({ from: oldPath, to: newPath });
        const value = fileMap.get(oldPath) ?? "";
        fileMap.delete(oldPath);
        fileMap.set(newPath, value);
      },
      mkdirSync: () => undefined,
    },
  });

  await store.upsertPreview("web.alpha", "hello", 101);

  assert.equal(writes.length, 1);
  assert.equal(renames.length, 1);
  assert.ok(writes[0]?.path.includes(".tmp-"));
  assert.equal(renames[0]?.from, writes[0]?.path);
  assert.equal(renames[0]?.to, store.filePath);
});

test("serialization: concurrent upserts stay consistent and last call wins", async (t) => {
  const repoRoot = makeTempRepo(t);
  const store = new WebSessionMetadataStore({ baseDir: repoRoot });

  const p1 = store.upsertPreview("web.alpha", "first", 1);
  const p2 = store.upsertPreview("web.alpha", "second", 2);
  const p3 = store.upsertPreview("web.alpha", "third", 3);
  await Promise.all([p1, p2, p3]);
  await store.flush();

  const loaded = store.readAll();
  const alpha = loaded.sessions["web.alpha"];
  assert.ok(alpha);
  assert.equal(alpha.lastUpdatedAt, 3);
  assert.equal(alpha.lastUserMessagePreview, "third");
});
