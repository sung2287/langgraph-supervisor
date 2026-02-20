import fs from "node:fs";
import path from "node:path";
import type { SessionState, SessionStore } from "./session.types";

export const SESSION_STATE_REL_PATH = path.join("ops", "runtime", "session_state.json");

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

function resolveSessionPath(baseDir: string): string {
  return path.resolve(baseDir, SESSION_STATE_REL_PATH);
}

export class FileSessionStore implements SessionStore {
  private readonly baseDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
  }

  load(): SessionState | null {
    const targetPath = resolveSessionPath(this.baseDir);

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
    const targetPath = resolveSessionPath(this.baseDir);
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
