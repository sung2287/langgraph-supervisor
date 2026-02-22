import fs from "node:fs";
import path from "node:path";
import { SESSION_STATE_REL_PATH } from "../../../src/session/file_session.store";
import {
  createSessionConflictError,
  toRuntimeError,
  type RuntimeErrorPayload,
} from "../../../runtime/error";
import { runRuntimeOnce } from "../../../runtime/orchestrator/run_request";
import {
  getRuntimeSessionSnapshot,
  resetRuntimeSession,
} from "../../../runtime/orchestrator/runtime.snapshot";
import {
  buildWebSessionFilename,
  buildWebSessionId,
  parseAuthorizedWebSessionIdFromFilename,
  toAuthorizedWebSessionId,
} from "../../../runtime/orchestrator/session_namespace";
import {
  WebSessionMetadataStore,
  type WebSessionMetaStore,
} from "../../../runtime/web/session_metadata.store";
import { mapToGraphStateSnapshot, type RuntimeObserverState } from "../../../runtime/web/mapper";
import type {
  GraphStateSnapshot,
  IWebRuntimeAdapter,
  WebErrorDTO,
  WebRerunInput,
  WebSessionContext,
  WebSessionDeleteResultDTO,
  WebSessionListItemDTO,
  WebSessionSwitchResultDTO,
  WebSubmitInput,
} from "./web.types";

interface AdapterOptions {
  readonly repoPath?: string;
  readonly runOnce?: typeof runRuntimeOnce;
  readonly resetSession?: typeof resetRuntimeSession;
  readonly getSessionSnapshot?: typeof getRuntimeSessionSnapshot;
  readonly metadataStore?: WebSessionMetadataStore;
}

const DEFAULT_MODE = "UNAVAILABLE";
const DEFAULT_DOMAIN = "UNAVAILABLE";
const DEFAULT_PROVIDER = "UNAVAILABLE";
const DEFAULT_MODEL = "UNAVAILABLE";
const DEFAULT_STEP = "Idle";
const DEFAULT_PHASE = "default";
const DEFAULT_PROFILE = "default";
const DEFAULT_SECRET_PROFILE = "default";
const HISTORY_MAX = 20;
const ENGINE_BUSY_ERROR = "ENGINE_BUSY";
const FORBIDDEN_ERROR = "FORBIDDEN";
const NOT_FOUND_ERROR = "SESSION_NOT_FOUND";

interface SessionFileProjection {
  readonly sessionId: string;
  readonly lastUpdatedAt: number;
}

export class WebSessionApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;

  constructor(statusCode: number, errorCode: string) {
    super(errorCode);
    this.name = "WebSessionApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

function toWebError(error: RuntimeErrorPayload): WebErrorDTO {
  return {
    errorCode: error.errorCode,
    guideMessage: error.guideMessage,
  };
}

function mergeHistory(
  existing: readonly { role: string; content: string }[],
  next: readonly { role: string; content: string }[]
): readonly { role: string; content: string }[] {
  const merged = [...existing, ...next];
  if (merged.length <= HISTORY_MAX) {
    return merged;
  }
  return merged.slice(merged.length - HISTORY_MAX);
}

function formatUtcCompact(value: Date): string {
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");
  const millis = String(value.getUTCMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}${millis}Z`;
}

function normalizeSessionPath(baseDir: string, sessionId: string): string {
  const filename = buildWebSessionFilename(sessionId);
  const runtimeRelDir = path.dirname(SESSION_STATE_REL_PATH);
  return path.resolve(baseDir, runtimeRelDir, filename);
}

function normalizePreviewLogValue(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9._-]/g, "_");
}

export class LocalWebRuntimeAdapter implements IWebRuntimeAdapter {
  private readonly repoPath: string;
  private readonly runOnce: typeof runRuntimeOnce;
  private readonly resetSessionRuntime: typeof resetRuntimeSession;
  private readonly readSessionSnapshot: typeof getRuntimeSessionSnapshot;
  private readonly metadataStore: WebSessionMetadataStore;
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly stateBySession = new Map<string, RuntimeObserverState>();
  private readonly listeners = new Map<string, Set<(snapshot: GraphStateSnapshot) => void>>();
  private activeSessionId: string | null = null;

  constructor(options: AdapterOptions = {}) {
    this.repoPath = options.repoPath ?? process.cwd();
    this.runOnce = options.runOnce ?? runRuntimeOnce;
    this.resetSessionRuntime = options.resetSession ?? resetRuntimeSession;
    this.readSessionSnapshot = options.getSessionSnapshot ?? getRuntimeSessionSnapshot;
    this.metadataStore =
      options.metadataStore ??
      new WebSessionMetadataStore({
        baseDir: this.repoPath,
        onError: (message) => console.warn(`[web] ${message}`),
      });
  }

  async initWebSession(sessionId: string): Promise<WebSessionContext> {
    const context = this.toContext(sessionId);
    this.activeSessionId = context.sessionId;
    this.ensureState(context.sessionId);
    this.emit(context.sessionId);
    return context;
  }

  async listWebSessions(sessionHint?: string): Promise<readonly WebSessionListItemDTO[]> {
    const files = this.listSessionFilesFromDisk();
    const metadata = this.safeReadMetadata();
    const activeSessionId = this.resolveActiveSessionId(sessionHint);

    const list = files.map((file) => {
      const overlay = metadata.sessions[file.sessionId];
      return {
        sessionId: file.sessionId,
        lastUserMessagePreview: overlay?.lastUserMessagePreview,
        lastUpdatedAt: overlay?.lastUpdatedAt ?? file.lastUpdatedAt,
        isActive: activeSessionId === file.sessionId,
      };
    });

    list.sort((left, right) => right.lastUpdatedAt - left.lastUpdatedAt);
    return list;
  }

  async switchWebSession(sessionId: string): Promise<WebSessionSwitchResultDTO> {
    const authorized = this.requireAuthorizedSessionId(sessionId);
    const sessionPath = normalizeSessionPath(this.repoPath, authorized);
    if (!fs.existsSync(sessionPath)) {
      throw new WebSessionApiError(404, NOT_FOUND_ERROR);
    }

    this.activeSessionId = authorized;
    this.ensureState(authorized);
    this.emit(authorized);
    return {
      currentSessionId: authorized,
      status: "SWITCHED",
    };
  }

  async deleteWebSession(sessionId: string): Promise<WebSessionDeleteResultDTO> {
    const authorized = this.requireAuthorizedSessionId(sessionId);
    const sourcePath = normalizeSessionPath(this.repoPath, authorized);
    if (!fs.existsSync(sourcePath)) {
      throw new WebSessionApiError(404, NOT_FOUND_ERROR);
    }
    if (this.inFlight.size > 0) {
      throw new WebSessionApiError(409, ENGINE_BUSY_ERROR);
    }

    const rotatedPath = this.resolveRotationTarget(sourcePath);
    fs.renameSync(sourcePath, rotatedPath);
    this.stateBySession.delete(authorized);
    await this.metadataStore.deleteMeta(authorized).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[web] WEB_SESSION_META_DELETE_ERROR session=${normalizePreviewLogValue(authorized)}: ${message}`
      );
    });

    let newActiveSessionId: string | undefined;
    if (this.activeSessionId === authorized) {
      newActiveSessionId = this.resolveFreshActiveSessionId(authorized);
      this.activeSessionId = newActiveSessionId;
      this.resetSessionRuntime(this.repoPath, buildWebSessionFilename(newActiveSessionId));
      this.ensureState(newActiveSessionId);
      this.emit(newActiveSessionId);
    }

    return {
      deletedSessionId: authorized,
      newActiveSessionId,
      status: "DELETED",
    };
  }

  async getCurrentState(sessionId: string): Promise<GraphStateSnapshot> {
    const context = this.toContext(sessionId);
    this.activeSessionId = context.sessionId;
    const existing = this.ensureState(context.sessionId);
    const projection = this.readSessionSnapshot(this.repoPath, context.sessionFilename);
    const fallbackStep = projection.exists ? "Ready" : DEFAULT_STEP;
    const observerState: RuntimeObserverState = {
      ...existing,
      currentStepLabel: existing.currentStepLabel ?? fallbackStep,
    };

    return mapToGraphStateSnapshot({
      sessionId: context.sessionId,
      isBusy: this.inFlight.has(context.sessionId),
      observerState,
    });
  }

  async submitInput(input: WebSubmitInput): Promise<GraphStateSnapshot> {
    const context = this.toContext(input.sessionId);
    this.activeSessionId = context.sessionId;
    if (this.inFlight.has(context.sessionId)) {
      throw createSessionConflictError(context.sessionId);
    }
    this.inFlight.set(context.sessionId, Promise.resolve());

    this.updateState(context.sessionId, {
      currentStepLabel: "Running",
      lastError: undefined,
    });
    this.emit(context.sessionId);

    try {
      try {
        await this.metadataStore.upsertPreview(context.sessionId, input.text, Date.now());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[web] WEB_SESSION_META_UPSERT_ERROR session=${normalizePreviewLogValue(
            context.sessionId
          )}: ${message}`
        );
      }

      const runPromise = (async () => {
        try {
          const result = await this.runOnce({
            inputText: input.text,
            repoPath: this.repoPath,
            phase: input.phase ?? DEFAULT_PHASE,
            currentDomain: input.domain,
            profile: input.profile ?? DEFAULT_PROFILE,
            secretProfile: input.secretProfile ?? DEFAULT_SECRET_PROFILE,
            freshSession: false,
            sessionName: context.sessionId,
            provider: input.provider,
            model: input.model,
            onStatus: (currentStepLabel) => {
              this.updateState(context.sessionId, { currentStepLabel });
              this.emit(context.sessionId);
            },
          });

          const previous = this.ensureState(context.sessionId);
          this.updateState(context.sessionId, {
            mode: result.modeLabel,
            domain: result.domain,
            activeProvider: result.provider,
            activeModel: result.model,
            secretProfileLabel: result.secretProfileLabel,
            currentStepLabel: result.currentStepLabel,
            history: mergeHistory(previous.history ?? [], result.history),
            lastError: undefined,
          });
        } catch (error) {
          const runtimeError = toRuntimeError(error);
          this.updateState(context.sessionId, {
            currentStepLabel: "Failed",
            lastError: toWebError(runtimeError),
          });
          throw runtimeError;
        } finally {
          this.emit(context.sessionId);
        }
      })();

      const lock = runPromise.then(() => undefined, () => undefined);
      this.inFlight.set(context.sessionId, lock);
      await runPromise;
    } finally {
      this.inFlight.delete(context.sessionId);
      this.emit(context.sessionId);
    }

    return this.getCurrentState(context.sessionId);
  }

  async resetSession(sessionId: string): Promise<GraphStateSnapshot> {
    const context = this.toContext(sessionId);
    this.activeSessionId = context.sessionId;
    if (this.inFlight.has(context.sessionId)) {
      throw createSessionConflictError(context.sessionId);
    }

    this.resetSessionRuntime(this.repoPath, context.sessionFilename);
    this.updateState(context.sessionId, {
      mode: DEFAULT_MODE,
      domain: DEFAULT_DOMAIN,
      activeProvider: DEFAULT_PROVIDER,
      activeModel: DEFAULT_MODEL,
      currentStepLabel: "Reset",
      history: [],
      lastError: undefined,
    });
    this.emit(context.sessionId);
    return this.getCurrentState(context.sessionId);
  }

  async rerunFromStart(input: WebRerunInput): Promise<GraphStateSnapshot> {
    await this.resetSession(input.sessionId);
    if (typeof input.text === "string" && input.text.trim() !== "") {
      return this.submitInput({
        sessionId: input.sessionId,
        text: input.text,
        provider: input.provider,
        model: input.model,
        profile: input.profile,
        secretProfile: input.secretProfile,
        phase: input.phase,
        domain: input.domain,
      });
    }
    return this.getCurrentState(input.sessionId);
  }

  subscribe(sessionId: string, listener: (snapshot: GraphStateSnapshot) => void): () => void {
    const context = this.toContext(sessionId);
    const set = this.listeners.get(context.sessionId) ?? new Set();
    set.add(listener);
    this.listeners.set(context.sessionId, set);
    this.getCurrentState(context.sessionId)
      .then((snapshot) => listener(snapshot))
      .catch(() => undefined);

    return () => {
      const current = this.listeners.get(context.sessionId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(context.sessionId);
      }
    };
  }

  private resolveFreshActiveSessionId(deletedSessionId: string): string {
    const defaultSession = buildWebSessionId("default");
    if (defaultSession !== deletedSessionId) {
      return defaultSession;
    }
    return buildWebSessionId("default.next");
  }

  private resolveRotationTarget(sourcePath: string): string {
    const baseTarget = `${sourcePath}_bak`;
    if (!fs.existsSync(baseTarget)) {
      return baseTarget;
    }
    const timestamp = formatUtcCompact(new Date());
    let candidate = `${baseTarget}.${timestamp}`;
    let counter = 0;
    while (fs.existsSync(candidate)) {
      counter += 1;
      candidate = `${baseTarget}.${timestamp}_${String(counter)}`;
    }
    return candidate;
  }

  private safeReadMetadata(): WebSessionMetaStore {
    try {
      return this.metadataStore.readAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[web] WEB_SESSION_META_LIST_ERROR ${message}`);
      return { sessions: {} };
    }
  }

  private listSessionFilesFromDisk(): readonly SessionFileProjection[] {
    const runtimeRelDir = path.dirname(SESSION_STATE_REL_PATH);
    const runtimeDirPath = path.resolve(this.repoPath, runtimeRelDir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(runtimeDirPath, { withFileTypes: true });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const projected: SessionFileProjection[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const sessionId = parseAuthorizedWebSessionIdFromFilename(entry.name);
      if (!sessionId) {
        continue;
      }
      const absolutePath = path.resolve(runtimeDirPath, entry.name);
      const stat = fs.statSync(absolutePath);
      projected.push({
        sessionId,
        lastUpdatedAt: stat.mtimeMs,
      });
    }
    return projected;
  }

  private resolveActiveSessionId(sessionHint?: string): string | null {
    if (typeof sessionHint === "string") {
      const hint = toAuthorizedWebSessionId(sessionHint);
      if (hint) {
        this.activeSessionId = hint;
      }
    }
    return this.activeSessionId;
  }

  private requireAuthorizedSessionId(sessionId: string): string {
    const authorized = toAuthorizedWebSessionId(sessionId);
    if (!authorized) {
      throw new WebSessionApiError(403, FORBIDDEN_ERROR);
    }
    return authorized;
  }

  private toContext(sessionId: string): WebSessionContext {
    const normalizedSessionId = buildWebSessionId(sessionId);
    return {
      sessionId: normalizedSessionId,
      sessionFilename: buildWebSessionFilename(normalizedSessionId),
    };
  }

  private ensureState(sessionId: string): RuntimeObserverState {
    const existing = this.stateBySession.get(sessionId);
    if (existing) {
      return existing;
    }

    const created: RuntimeObserverState = {
      mode: DEFAULT_MODE,
      domain: DEFAULT_DOMAIN,
      activeProvider: DEFAULT_PROVIDER,
      activeModel: DEFAULT_MODEL,
      secretProfileLabel: DEFAULT_SECRET_PROFILE,
      history: [],
      currentStepLabel: DEFAULT_STEP,
    };
    this.stateBySession.set(sessionId, created);
    return created;
  }

  private updateState(sessionId: string, next: Partial<RuntimeObserverState>): void {
    const current = this.ensureState(sessionId);
    this.stateBySession.set(sessionId, {
      ...current,
      ...next,
    });
  }

  private emit(sessionId: string): void {
    const listeners = this.listeners.get(sessionId);
    if (!listeners || listeners.size === 0) {
      return;
    }

    this.getCurrentState(sessionId)
      .then((snapshot) => {
        for (const listener of listeners) {
          listener(snapshot);
        }
      })
      .catch(() => undefined);
  }
}
