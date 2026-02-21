import fs from "node:fs";
import path from "node:path";
import BetterSqlite3, { type Database as BetterSqliteDatabase } from "better-sqlite3";

export type SQLiteParam = string | number | bigint | Buffer | null;

export interface Storage {
  connect(): void;
  close(): void;
  exec(sql: string, params?: readonly SQLiteParam[]): unknown;
  query<T extends Record<string, unknown>>(
    sql: string,
    params?: readonly SQLiteParam[]
  ): readonly T[];
}

export interface SQLiteStorageOptions {
  readonly dbPath?: string;
  readonly expectedSchemaVersion?: string;
  readonly ["readonly"]?: boolean;
}

export const DEFAULT_SQLITE_DB_REL_PATH = path.join("ops", "runtime", "runtime.db");
export const SQLITE_STORAGE_SCHEMA_VERSION = "1";

const CREATE_SCHEMA_VERSION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const CREATE_PRD006_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  root_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  previous_version_id TEXT,
  text TEXT NOT NULL,
  strength TEXT CHECK(strength IN ('axis', 'lock', 'normal')) NOT NULL,
  scope TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(root_id, version)
);

CREATE TABLE IF NOT EXISTS evidences (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  tags TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS decision_evidence_links (
  decision_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  PRIMARY KEY (decision_id, evidence_id),
  FOREIGN KEY(decision_id) REFERENCES decisions(id),
  FOREIGN KEY(evidence_id) REFERENCES evidences(id)
);

CREATE TABLE IF NOT EXISTS anchors (
  id TEXT PRIMARY KEY,
  hint TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  type TEXT CHECK(type IN ('evidence_link', 'decision_link')) NOT NULL
);

CREATE TABLE IF NOT EXISTS repository_snapshots (
  version_id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  last_scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_decisions_scope_strength_active
  ON decisions(scope, strength, is_active);

CREATE INDEX IF NOT EXISTS idx_decisions_root_version
  ON decisions(root_id, version);

CREATE INDEX IF NOT EXISTS idx_links_evidence
  ON decision_evidence_links(evidence_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_decisions_single_active
  ON decisions(root_id)
  WHERE is_active = 1;
`;

function resolveDbPath(explicitPath?: string): string {
  if (explicitPath && explicitPath.trim() !== "") {
    return path.resolve(explicitPath);
  }
  return path.resolve(process.cwd(), DEFAULT_SQLITE_DB_REL_PATH);
}

export class SQLiteStorage implements Storage {
  private readonly dbPath: string;
  private readonly expectedSchemaVersion: string;
  private readonly readOnlyMode: boolean;
  private db: BetterSqliteDatabase | null = null;
  private closed = false;

  constructor(options: SQLiteStorageOptions = {}) {
    this.dbPath = resolveDbPath(options.dbPath);
    this.expectedSchemaVersion = options.expectedSchemaVersion ?? SQLITE_STORAGE_SCHEMA_VERSION;
    this.readOnlyMode = options["readonly"] === true;
  }

  connect(): void {
    if (this.closed) {
      throw new Error("SQLITE_STORAGE_ERROR storage has been closed");
    }
    if (this.db !== null) {
      throw new Error("SQLITE_STORAGE_ERROR single connection already opened");
    }

    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const db = this.readOnlyMode
      ? new BetterSqlite3(this.dbPath, { readonly: true, fileMustExist: true })
      : new BetterSqlite3(this.dbPath);

    try {
      if (!this.readOnlyMode) {
        db.exec("PRAGMA journal_mode = WAL;");
        db.exec("PRAGMA synchronous = FULL;");
      }
      db.exec("PRAGMA foreign_keys = ON;");
      this.db = db;
      this.initializeSchema();
    } catch (error) {
      db.close();
      this.db = null;
      throw error;
    }
  }

  close(): void {
    if (this.db === null) {
      this.closed = true;
      return;
    }
    this.db.close();
    this.db = null;
    this.closed = true;
  }

  exec(sql: string, params: readonly SQLiteParam[] = []): unknown {
    this.assertWritable();
    const db = this.requireDb();
    return db.prepare(sql).run(...params);
  }

  query<T extends Record<string, unknown>>(
    sql: string,
    params: readonly SQLiteParam[] = []
  ): readonly T[] {
    const db = this.requireDb();
    return db.prepare(sql).all(...params) as T[];
  }

  getResolvedDbPath(): string {
    return this.dbPath;
  }

  private initializeSchema(): void {
    const db = this.requireDb();
    if (!this.readOnlyMode) {
      db.exec(CREATE_SCHEMA_VERSION_TABLE_SQL);
    }

    this.validateSchemaVersionTableShape();

    const versions = this.query<{ version: unknown }>(
      "SELECT version FROM schema_version ORDER BY version ASC"
    );

    if (this.readOnlyMode) {
      this.assertSchemaVersionMatch(versions);
      return;
    }

    if (versions.length === 0) {
      db.exec("BEGIN TRANSACTION;");
      try {
        db.exec(CREATE_PRD006_SCHEMA_SQL);
        this.exec("INSERT INTO schema_version(version) VALUES (?)", [
          this.expectedSchemaVersion,
        ]);
        db.exec("COMMIT;");
      } catch (error) {
        db.exec("ROLLBACK;");
        throw error;
      }
      return;
    }

    this.assertSchemaVersionMatch(versions);
    db.exec(CREATE_PRD006_SCHEMA_SQL);
  }

  private assertSchemaVersionMatch(versions: readonly { version: unknown }[]): void {
    const storedVersions = versions
      .map((row) => row.version)
      .filter((value): value is string => typeof value === "string");
    const schemaMatches =
      storedVersions.length === 1 && storedVersions[0] === this.expectedSchemaVersion;

    if (!schemaMatches) {
      throw new Error(
        `SQLITE_STORAGE_VERSION_MISMATCH expected=${this.expectedSchemaVersion} actual=${storedVersions.join(",")}`
      );
    }
  }

  private validateSchemaVersionTableShape(): void {
    const columns = this.query<{
      name?: unknown;
      type?: unknown;
      pk?: unknown;
    }>("PRAGMA table_info(schema_version)");

    const normalized = columns.map((column) => ({
      name: typeof column.name === "string" ? column.name : "",
      type: typeof column.type === "string" ? column.type.toUpperCase() : "",
      pk: Number(column.pk ?? 0),
    }));

    const isExactShape =
      normalized.length === 2 &&
      normalized[0]?.name === "version" &&
      normalized[0]?.type === "TEXT" &&
      normalized[0]?.pk === 1 &&
      normalized[1]?.name === "applied_at" &&
      normalized[1]?.type === "TIMESTAMP" &&
      normalized[1]?.pk === 0;

    if (!isExactShape) {
      throw new Error("SQLITE_STORAGE_SCHEMA_CORRUPTED schema_version shape mismatch");
    }
  }

  private assertWritable(): void {
    if (this.readOnlyMode) {
      throw new Error("SQLITE_STORAGE_READONLY_WRITE_BLOCKED");
    }
  }

  private requireDb(): BetterSqliteDatabase {
    if (this.db === null) {
      if (this.closed) {
        throw new Error("SQLITE_STORAGE_ERROR connection is closed");
      }
      throw new Error("SQLITE_STORAGE_ERROR connection is not open");
    }
    return this.db;
  }
}
