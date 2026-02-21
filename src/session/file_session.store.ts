import fs from "node:fs";
import path from "node:path";
import type { SessionState, SessionStore } from "./session.types";

const SESSION_RUNTIME_REL_DIR = path.join("ops", "runtime");
const BACKUP_DIR_NAME = "_bak";
const DEFAULT_SESSION_FILENAME = "session_state.json";
const MAX_BACKUP_FILES_PER_GROUP = 10;
// Default session path only. Namespaced sessions use session_state.<name>.json under the same dir.
export const SESSION_STATE_REL_PATH = path.join(
  SESSION_RUNTIME_REL_DIR,
  DEFAULT_SESSION_FILENAME
);

const WHITELIST_KEYS = [
  "sessionId",
  "memoryRef",
  "repoScanVersion",
  "lastExecutionPlanHash",
  "updatedAt",
] as const;

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error("SESSION_STATE_VALIDATION_ERROR state must be an object");
}

function validateSessionState(value: unknown): SessionState {
  const row = toRecord(value);
  const keys = Object.keys(row).sort();
  const allowed = [...WHITELIST_KEYS].sort();

  if (keys.length !== allowed.length || keys.some((key, idx) => key !== allowed[idx])) {
    throw new Error("SESSION_STATE_VALIDATION_ERROR unexpected fields present");
  }

  for (const key of WHITELIST_KEYS) {
    if (typeof row[key] !== "string") {
      throw new Error(`SESSION_STATE_VALIDATION_ERROR ${key} must be a string`);
    }
  }

  return {
    sessionId: row.sessionId as string,
    memoryRef: row.memoryRef as string,
    repoScanVersion: row.repoScanVersion as string,
    lastExecutionPlanHash: row.lastExecutionPlanHash as string,
    updatedAt: row.updatedAt as string,
  };
}

function resolveSessionPath(baseDir: string, filename: string): string {
  return path.resolve(baseDir, SESSION_RUNTIME_REL_DIR, filename);
}

function normalizeFilename(filename?: string): string {
  const normalized = typeof filename === "string" ? filename.trim() : DEFAULT_SESSION_FILENAME;
  if (normalized === DEFAULT_SESSION_FILENAME) {
    return normalized;
  }
  if (!/^session_state\.[A-Za-z0-9._-]+\.json$/.test(normalized)) {
    throw new Error(
      `SESSION_STATE_PATH_ERROR invalid session filename: ${normalized}`
    );
  }
  return normalized;
}

function formatTimestampLocal(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  const seconds = String(value.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function originalNameFromFilename(filename: string): string {
  if (filename === DEFAULT_SESSION_FILENAME) {
    return "default";
  }
  const matched = /^session_state\.([A-Za-z0-9._-]+)\.json$/.exec(filename);
  if (!matched) {
    throw new Error(`SESSION_STATE_PATH_ERROR invalid session filename: ${filename}`);
  }
  return matched[1]!;
}

function enforceBackupRetention(backupDirPath: string, originalName: string): void {
  const prefix = `session_state.${originalName}.`;
  const suffix = ".json.bak";
  const entries = fs
    .readdirSync(backupDirPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(suffix)
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (entries.length <= MAX_BACKUP_FILES_PER_GROUP) {
    return;
  }

  const excess = entries.slice(0, entries.length - MAX_BACKUP_FILES_PER_GROUP);
  for (const name of excess) {
    fs.unlinkSync(path.join(backupDirPath, name));
  }
}

function rotateSessionFile(baseDir: string, filename: string): void {
  const sourcePath = resolveSessionPath(baseDir, filename);
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const runtimeDirPath = path.dirname(sourcePath);
  const backupDirPath = path.join(runtimeDirPath, BACKUP_DIR_NAME);
  const originalName = originalNameFromFilename(filename);
  const timestamp = formatTimestampLocal(new Date());
  const backupFilename = `session_state.${originalName}.${timestamp}.json.bak`;
  const backupPath = path.join(backupDirPath, backupFilename);

  try {
    fs.mkdirSync(backupDirPath, { recursive: true });
    fs.renameSync(sourcePath, backupPath);
    enforceBackupRetention(backupDirPath, originalName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `SESSION_STATE_ROTATION_ERROR ${sourcePath} -> ${backupPath}: ${message}`
    );
  }
}

export interface FileSessionStoreOptions {
  filename?: string;
}

export class FileSessionStore implements SessionStore {
  private readonly baseDir: string;
  private readonly filename: string;

  constructor(baseDir: string = process.cwd(), options: FileSessionStoreOptions = {}) {
    this.baseDir = baseDir;
    this.filename = normalizeFilename(options.filename);
  }

  prepareFreshSession(): void {
    rotateSessionFile(this.baseDir, this.filename);
  }

  load(): SessionState | null {
    const targetPath = resolveSessionPath(this.baseDir, this.filename);

    let serialized: string;
    try {
      serialized = fs.readFileSync(targetPath, "utf8");
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") {
        return null;
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized) as unknown;
    } catch (error) {
      throw new Error(
        `SESSION_STATE_PARSE_ERROR ${targetPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return validateSessionState(parsed);
  }

  verify(expectedHash: string): void {
    const loaded = this.load();
    if (loaded === null) {
      return;
    }

    if (loaded.lastExecutionPlanHash !== expectedHash) {
      throw new Error(
        `SESSION_STATE_HASH_MISMATCH expected=${expectedHash} actual=${loaded.lastExecutionPlanHash}`
      );
    }
  }

  save(next: SessionState): void {
    const targetPath = resolveSessionPath(this.baseDir, this.filename);
    const dirPath = path.dirname(targetPath);
    const tmpPath = `${targetPath}.tmp-${process.pid}`;

    const serialized = `${JSON.stringify(
      {
        sessionId: next.sessionId,
        memoryRef: next.memoryRef,
        repoScanVersion: next.repoScanVersion,
        lastExecutionPlanHash: next.lastExecutionPlanHash,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`;

    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(tmpPath, serialized, "utf8");
    fs.renameSync(tmpPath, targetPath);
  }
}
