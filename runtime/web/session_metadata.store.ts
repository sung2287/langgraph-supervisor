import fs from "node:fs";
import path from "node:path";

const DEFAULT_META_REL_PATH = path.join("ops", "runtime", "web_session_meta.json");
const PREVIEW_MAX_LENGTH = 50;

export interface WebSessionMetaEntry {
  readonly sessionId: string;
  readonly lastUserMessagePreview?: string;
  readonly lastUpdatedAt: number;
}

export interface WebSessionMetaStore {
  readonly sessions: Record<string, WebSessionMetaEntry>;
}

interface SessionMetadataFs {
  readFileSync(path: string, encoding: BufferEncoding): string;
  writeFileSync(path: string, data: string, encoding: BufferEncoding): void;
  renameSync(oldPath: string, newPath: string): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

interface SessionMetadataStoreOptions {
  readonly baseDir?: string;
  readonly relativePath?: string;
  readonly fsImpl?: SessionMetadataFs;
  readonly onError?: (message: string) => void;
}

function emptyStore(): WebSessionMetaStore {
  return { sessions: {} };
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeStore(value: unknown): WebSessionMetaStore {
  const root = asObject(value);
  if (!root) {
    return emptyStore();
  }
  const sessionsRow = asObject(root.sessions);
  if (!sessionsRow) {
    return emptyStore();
  }

  const sessions: Record<string, WebSessionMetaEntry> = {};
  for (const [sessionId, entry] of Object.entries(sessionsRow)) {
    const parsed = asObject(entry);
    if (!parsed) {
      continue;
    }
    const entrySessionId =
      typeof parsed.sessionId === "string" && parsed.sessionId !== ""
        ? parsed.sessionId
        : sessionId;
    const lastUpdatedAt =
      typeof parsed.lastUpdatedAt === "number" && Number.isFinite(parsed.lastUpdatedAt)
        ? parsed.lastUpdatedAt
        : 0;
    const lastUserMessagePreview =
      typeof parsed.lastUserMessagePreview === "string" && parsed.lastUserMessagePreview !== ""
        ? parsed.lastUserMessagePreview
        : undefined;
    sessions[sessionId] = {
      sessionId: entrySessionId,
      lastUpdatedAt,
      lastUserMessagePreview,
    };
  }

  return { sessions };
}

function normalizePreview(userText: string): string {
  return userText.replace(/\r?\n/g, " ").slice(0, PREVIEW_MAX_LENGTH);
}

function serializeStore(store: WebSessionMetaStore): string {
  return `${JSON.stringify(store, null, 2)}\n`;
}

export class WebSessionMetadataStore {
  private readonly metadataPath: string;
  private readonly fsImpl: SessionMetadataFs;
  private readonly onError?: (message: string) => void;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: SessionMetadataStoreOptions = {}) {
    const baseDir = options.baseDir ?? process.cwd();
    const relativePath = options.relativePath ?? DEFAULT_META_REL_PATH;
    this.metadataPath = path.resolve(baseDir, relativePath);
    this.fsImpl = options.fsImpl ?? fs;
    this.onError = options.onError;
  }

  get filePath(): string {
    return this.metadataPath;
  }

  readAll(): WebSessionMetaStore {
    let raw: string;
    try {
      raw = this.fsImpl.readFileSync(this.metadataPath, "utf8");
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") {
        return emptyStore();
      }
      throw error;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return normalizeStore(parsed);
    } catch (error) {
      this.onError?.(
        `WEB_SESSION_META_READ_ERROR ${this.metadataPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return emptyStore();
    }
  }

  upsertPreview(sessionId: string, userText: string, nowMs: number): Promise<void> {
    return this.enqueueWrite(() => {
      const store = this.readAll();
      const previous = store.sessions[sessionId];
      const next: WebSessionMetaEntry = {
        sessionId,
        lastUpdatedAt: nowMs,
        lastUserMessagePreview: normalizePreview(userText),
      };
      store.sessions[sessionId] = {
        ...previous,
        ...next,
      };
      this.writeAtomic(store);
    });
  }

  deleteMeta(sessionId: string): Promise<void> {
    return this.enqueueWrite(() => {
      const store = this.readAll();
      if (!(sessionId in store.sessions)) {
        return;
      }
      const nextSessions = { ...store.sessions };
      delete nextSessions[sessionId];
      this.writeAtomic({ sessions: nextSessions });
    });
  }

  flush(): Promise<void> {
    return this.writeQueue;
  }

  private enqueueWrite(action: () => void): Promise<void> {
    const next = this.writeQueue.then(() => {
      action();
    });
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  private writeAtomic(store: WebSessionMetaStore): void {
    const dirPath = path.dirname(this.metadataPath);
    const tmpPath = `${this.metadataPath}.tmp-${process.pid}-${Date.now()}`;
    this.fsImpl.mkdirSync(dirPath, { recursive: true });
    this.fsImpl.writeFileSync(tmpPath, serializeStore(store), "utf8");
    this.fsImpl.renameSync(tmpPath, this.metadataPath);
  }
}
