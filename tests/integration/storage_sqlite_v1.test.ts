/**
 * Intent: PRD-005/006 integration lock — SQLite v1 storage boot, schema integrity, atomic updates, and boundary invariants.
 * Scope: Active sqlite.storage/sqlite.stores behavior using temp runtime.db via createSQLiteStorageLayer.
 * Non-Goals: Policy/domain logic, retrieval strategy tuning, or summary-memory behavior implementation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import {
  createSQLiteStorageLayer,
  SQLITE_STORAGE_SCHEMA_VERSION,
} from "../../src/adapter/storage/sqlite";

function createTempDb(t: test.TestContext): { readonly dir: string; readonly dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-v1-it-"));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    dir,
    dbPath: path.join(dir, "runtime.db"),
  };
}

test("A) boot/schema: tables, indexes, pragmas are initialized", (t) => {
  const { dbPath } = createTempDb(t);
  const layer = createSQLiteStorageLayer({ dbPath });
  layer.storage.connect();
  t.after(() => layer.storage.close());

  const tables = layer.storage.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC"
  );
  const tableNames = new Set(tables.map((row) => row.name));
  for (const requiredTable of [
    "schema_version",
    "decisions",
    "evidences",
    "decision_evidence_links",
    "anchors",
    "repository_snapshots",
  ]) {
    assert.equal(tableNames.has(requiredTable), true, `missing table: ${requiredTable}`);
  }

  const indexes = layer.storage.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name ASC"
  );
  const indexNames = new Set(indexes.map((row) => row.name));
  for (const requiredIndex of [
    "idx_decisions_scope_strength_active",
    "idx_decisions_root_version",
    "idx_links_evidence",
    "idx_decisions_single_active",
  ]) {
    assert.equal(indexNames.has(requiredIndex), true, `missing index: ${requiredIndex}`);
  }

  const foreignKeyRow =
    layer.storage.query<Record<string, unknown>>("PRAGMA foreign_keys")[0] ?? {};
  assert.equal(Number(Object.values(foreignKeyRow)[0] ?? 0), 1);

  const journalModeRow =
    layer.storage.query<Record<string, unknown>>("PRAGMA journal_mode")[0] ?? {};
  assert.equal(String(Object.values(journalModeRow)[0] ?? "").toLowerCase(), "wal");
});

test("B) version gate: wrong schema_version fails fast", (t) => {
  const { dbPath } = createTempDb(t);

  const setup = createSQLiteStorageLayer({ dbPath });
  setup.storage.connect();
  setup.storage.exec("DELETE FROM schema_version");
  setup.storage.exec("INSERT INTO schema_version(version) VALUES (?)", ["wrong"]);
  setup.storage.close();

  const probe = createSQLiteStorageLayer({ dbPath });
  assert.throws(
    () => probe.storage.connect(),
    /SQLITE_STORAGE_VERSION_MISMATCH/
  );
});

test("B) version gate: tampered schema_version shape fails fast", (t) => {
  const { dbPath } = createTempDb(t);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new BetterSqlite3(dbPath);
  db.exec(`
    CREATE TABLE schema_version (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      extra_col TEXT
    );
  `);
  db.prepare("INSERT INTO schema_version(version, extra_col) VALUES (?, ?)").run(
    SQLITE_STORAGE_SCHEMA_VERSION,
    "x"
  );
  db.close();

  const probe = createSQLiteStorageLayer({ dbPath });
  assert.throws(
    () => probe.storage.connect(),
    /SQLITE_STORAGE_SCHEMA_CORRUPTED/
  );
});

test("C) atomic decision update: v1 to v2 keeps single active row", (t) => {
  const { dbPath } = createTempDb(t);
  const layer = createSQLiteStorageLayer({ dbPath });
  layer.storage.connect();
  t.after(() => layer.storage.close());

  layer.decisionStore.insertDecisionV1({
    id: "d1",
    rootId: "d1",
    version: 1,
    text: "v1",
    strength: "axis",
    scope: "global",
  });

  layer.decisionStore.createNextVersionAtomically("d1", "d1", {
    id: "d2",
    version: 2,
    text: "v2",
    strength: "axis",
    scope: "global",
  });

  const rows = layer.storage.query<Record<string, unknown>>(
    "SELECT id, version, is_active FROM decisions WHERE root_id = ? ORDER BY version ASC",
    ["d1"]
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => Number(row.version)),
    [1, 2]
  );
  assert.deepEqual(
    rows.map((row) => Number(row.is_active)),
    [0, 1]
  );

  const activeCountRow =
    layer.storage.query<Record<string, unknown>>(
      "SELECT COUNT(*) AS count_active FROM decisions WHERE root_id = ? AND is_active = 1",
      ["d1"]
    )[0] ?? {};
  assert.equal(Number(activeCountRow.count_active ?? 0), 1);
});

test("C) atomic decision update rollback: insert failure restores previous active state", (t) => {
  const { dbPath } = createTempDb(t);
  const layer = createSQLiteStorageLayer({ dbPath });
  layer.storage.connect();
  t.after(() => layer.storage.close());

  layer.decisionStore.insertDecisionV1({
    id: "d1",
    rootId: "d1",
    version: 1,
    text: "v1",
    strength: "lock",
    scope: "global",
  });

  assert.throws(() =>
    layer.decisionStore.createNextVersionAtomically("d1", "d1", {
      id: "d2",
      version: 1,
      text: "duplicate version",
      strength: "lock",
      scope: "global",
    })
  );

  const rows = layer.storage.query<Record<string, unknown>>(
    "SELECT id, version, is_active FROM decisions WHERE root_id = ? ORDER BY version ASC",
    ["d1"]
  );
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0]?.version ?? 0), 1);
  assert.equal(Number(rows[0]?.is_active ?? 0), 1);
});

test("D) evidence/decision independence and M:N link FK behavior", (t) => {
  const { dbPath } = createTempDb(t);
  const layer = createSQLiteStorageLayer({ dbPath });
  layer.storage.connect();
  t.after(() => layer.storage.close());

  layer.evidenceStore.insertEvidence({
    id: "e1",
    content: "evidence only",
  });

  layer.decisionStore.insertDecisionV1({
    id: "d1",
    rootId: "d1",
    version: 1,
    text: "decision only",
    strength: "normal",
    scope: "global",
  });

  const evidenceCount =
    layer.storage.query<Record<string, unknown>>("SELECT COUNT(*) AS c FROM evidences")[0] ?? {};
  const decisionCount =
    layer.storage.query<Record<string, unknown>>("SELECT COUNT(*) AS c FROM decisions")[0] ?? {};
  assert.equal(Number(evidenceCount.c ?? 0), 1);
  assert.equal(Number(decisionCount.c ?? 0), 1);

  assert.throws(
    () => layer.linkStore.linkDecisionEvidence("missing-decision", "missing-evidence"),
    /FOREIGN KEY/
  );

  layer.linkStore.linkDecisionEvidence("d1", "e1");
  const linkCount =
    layer.storage.query<Record<string, unknown>>(
      "SELECT COUNT(*) AS c FROM decision_evidence_links WHERE decision_id = ? AND evidence_id = ?",
      ["d1", "e1"]
    )[0] ?? {};
  assert.equal(Number(linkCount.c ?? 0), 1);
});

test("E) anchor polymorphic ref: DB allows non-existent target_ref (non-FK)", (t) => {
  const { dbPath } = createTempDb(t);
  const layer = createSQLiteStorageLayer({ dbPath });
  layer.storage.connect();
  t.after(() => layer.storage.close());

  layer.anchorStore.insertAnchor({
    id: "a1",
    hint: "non-fk anchor",
    targetRef: "does-not-exist",
    type: "evidence_link",
  });

  const count =
    layer.storage.query<Record<string, unknown>>(
      "SELECT COUNT(*) AS c FROM anchors WHERE id = ?",
      ["a1"]
    )[0] ?? {};
  assert.equal(Number(count.c ?? 0), 1);
});

test("F) forbidden contamination: no memories table and no summary/keywords columns", (t) => {
  const { dbPath } = createTempDb(t);
  const layer = createSQLiteStorageLayer({ dbPath });
  layer.storage.connect();
  t.after(() => layer.storage.close());

  const tables = layer.storage.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC"
  );
  const tableNames = tables.map((row) => row.name);
  assert.equal(tableNames.includes("memories"), false);

  for (const tableName of tableNames) {
    const cols = layer.storage.query<{ name: string }>(`PRAGMA table_info(${tableName})`);
    const lowerNames = cols.map((col) => col.name.toLowerCase());
    assert.equal(lowerNames.includes("summary"), false, `forbidden column summary in ${tableName}`);
    assert.equal(
      lowerNames.includes("keywords"),
      false,
      `forbidden column keywords in ${tableName}`
    );
  }
});

test("G) readonly mode: connect works for existing db and write exec is blocked", (t) => {
  const { dbPath } = createTempDb(t);

  const writable = createSQLiteStorageLayer({ dbPath });
  writable.storage.connect();
  writable.storage.close();

  const readonlyLayer = createSQLiteStorageLayer({ dbPath, readonly: true });
  readonlyLayer.storage.connect();
  t.after(() => readonlyLayer.storage.close());

  const versionRows = readonlyLayer.storage.query<Record<string, unknown>>(
    "SELECT version FROM schema_version"
  );
  assert.equal(versionRows.length, 1);
  assert.equal(String(versionRows[0]?.version ?? ""), SQLITE_STORAGE_SCHEMA_VERSION);

  assert.throws(
    () =>
      readonlyLayer.storage.exec("INSERT INTO evidences (id, content) VALUES (?, ?)", [
        "e-ro",
        "blocked",
      ]),
    /SQLITE_STORAGE_READONLY_WRITE_BLOCKED/
  );
});
