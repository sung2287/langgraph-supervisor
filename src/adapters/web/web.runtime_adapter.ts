import {
  createSessionConflictError,
  toRuntimeError,
  type RuntimeErrorPayload,
} from "../../../runtime/error";
import { runRuntimeOnce } from "../../../runtime/orchestrator/run_request";
import { getRuntimeSessionSnapshot, resetRuntimeSession } from "../../../runtime/orchestrator/runtime.snapshot";
import {
  buildWebSessionFilename,
  buildWebSessionId,
} from "../../../runtime/orchestrator/session_namespace";
import { mapToGraphStateSnapshot, type RuntimeObserverState } from "../../../runtime/web/mapper";
import type {
  GraphStateSnapshot,
  IWebRuntimeAdapter,
  WebErrorDTO,
  WebRerunInput,
  WebSessionContext,
  WebSubmitInput,
} from "./web.types";

interface AdapterOptions {
  readonly repoPath?: string;
  readonly runOnce?: typeof runRuntimeOnce;
  readonly resetSession?: typeof resetRuntimeSession;
  readonly getSessionSnapshot?: typeof getRuntimeSessionSnapshot;
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

export class LocalWebRuntimeAdapter implements IWebRuntimeAdapter {
  private readonly repoPath: string;
  private readonly runOnce: typeof runRuntimeOnce;
  private readonly resetSessionRuntime: typeof resetRuntimeSession;
  private readonly readSessionSnapshot: typeof getRuntimeSessionSnapshot;
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly stateBySession = new Map<string, RuntimeObserverState>();
  private readonly listeners = new Map<string, Set<(snapshot: GraphStateSnapshot) => void>>();

  constructor(options: AdapterOptions = {}) {
    this.repoPath = options.repoPath ?? process.cwd();
    this.runOnce = options.runOnce ?? runRuntimeOnce;
    this.resetSessionRuntime = options.resetSession ?? resetRuntimeSession;
    this.readSessionSnapshot = options.getSessionSnapshot ?? getRuntimeSessionSnapshot;
  }

  async initWebSession(sessionId: string): Promise<WebSessionContext> {
    const context = this.toContext(sessionId);
    this.ensureState(context.sessionId);
    this.emit(context.sessionId);
    return context;
  }

  async getCurrentState(sessionId: string): Promise<GraphStateSnapshot> {
    const context = this.toContext(sessionId);
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
    if (this.inFlight.has(context.sessionId)) {
      throw createSessionConflictError(context.sessionId);
    }

    this.updateState(context.sessionId, {
      currentStepLabel: "Running",
      lastError: undefined,
    });
    this.emit(context.sessionId);

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
    try {
      await runPromise;
    } finally {
      this.inFlight.delete(context.sessionId);
      this.emit(context.sessionId);
    }

    return this.getCurrentState(context.sessionId);
  }

  async resetSession(sessionId: string): Promise<GraphStateSnapshot> {
    const context = this.toContext(sessionId);
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
