import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphStateSnapshot,
  HistoryItem,
  WebSessionDeleteResultDTO,
  WebSessionListItemDTO,
  WebSessionSwitchResultDTO,
} from "../../web.types";
import { SessionPanel } from "./SessionPanel";
import { Timeline } from "./Timeline";

const DEFAULT_SESSION_NAME = "web.default";
const RETRY_DELAY_MS = 1500;
const REPLAY_DURATION_TARGET_MS = 1800;
const REPLAY_DURATION_CAP_MS = 2000;
const NO_WHITESPACE_CHUNK_SIZE = 4;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (typeof payload.error === "string") {
      throw new Error(payload.error);
    }
    const errorCode =
      typeof payload.errorCode === "string" ? payload.errorCode : "RUNTIME_FAILED";
    const guideMessage =
      typeof payload.guideMessage === "string" ? payload.guideMessage : "request_failed";
    const message = typeof payload.message === "string" ? payload.message : response.statusText;
    throw new Error(`${errorCode}: ${guideMessage}: ${message}`);
  }
  return payload as T;
}

function parseSessionNameFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("session");
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.trim();
  }
  return DEFAULT_SESSION_NAME;
}

function withSessionQuery(pathname: string, session: string): string {
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}session=${encodeURIComponent(session)}`;
}

function resolveLastAssistant(history: readonly HistoryItem[]): { index: number; content: string } | null {
  if (history.length < 1) {
    return null;
  }

  const candidateIndex = history.length - 1;
  const candidate = history[candidateIndex];
  if (candidate?.role === "assistant") {
    return { index: candidateIndex, content: candidate.content };
  }

  const fallbackIndex = history.length - 2;
  if (fallbackIndex < 0) {
    return null;
  }
  const fallback = history[fallbackIndex];
  if (fallback?.role === "assistant") {
    return { index: fallbackIndex, content: fallback.content };
  }
  return null;
}

function splitReplayChunks(text: string): string[] {
  if (text.length === 0) {
    return [""];
  }

  if (/\s/.test(text)) {
    const tokens = text.match(/\S+\s*|\s+/g);
    if (tokens && tokens.length > 0) {
      return tokens;
    }
  }

  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += NO_WHITESPACE_CHUNK_SIZE) {
    chunks.push(text.slice(index, index + NO_WHITESPACE_CHUNK_SIZE));
  }
  return chunks.length > 0 ? chunks : [text];
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App(): JSX.Element {
  const sessionName = useMemo(() => parseSessionNameFromLocation(), []);
  const [sessionId, setSessionId] = useState(sessionName);
  const [snapshot, setSnapshot] = useState<GraphStateSnapshot | null>(null);
  const [inputText, setInputText] = useState("");
  const [clientError, setClientError] = useState("");
  const [sessionPanelError, setSessionPanelError] = useState("");
  const [sessions, setSessions] = useState<readonly WebSessionListItemDTO[]>([]);
  const [isDevOverlayVisible, setDevOverlayVisible] = useState(false);
  const [isSessionInitialized, setSessionInitialized] = useState(false);
  const [replayActive, setReplayActive] = useState(false);
  const [replayTargetIndex, setReplayTargetIndex] = useState<number | null>(null);
  const [replayFullText, setReplayFullText] = useState("");
  const [replayVisibleText, setReplayVisibleText] = useState("");

  const previousSnapshotRef = useRef<GraphStateSnapshot | null>(null);
  const replaySignatureRef = useRef<string | null>(null);
  const replayAnimationIdRef = useRef<number | null>(null);
  const replayTokenRef = useRef(0);
  const replayActiveRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const abortReplay = useCallback((): void => {
    if (replayAnimationIdRef.current !== null) {
      window.cancelAnimationFrame(replayAnimationIdRef.current);
      replayAnimationIdRef.current = null;
    }
    replayTokenRef.current += 1;
    replayActiveRef.current = false;
    setReplayActive(false);
    setReplayTargetIndex(null);
    setReplayFullText("");
    setReplayVisibleText("");
  }, []);

  const startReplay = useCallback(
    (targetIndex: number, fullText: string, signature: string): void => {
      abortReplay();
      replaySignatureRef.current = signature;
      replayActiveRef.current = true;
      setReplayActive(true);
      setReplayTargetIndex(targetIndex);
      setReplayFullText(fullText);
      setReplayVisibleText("");

      const chunks = splitReplayChunks(fullText);
      const token = replayTokenRef.current + 1;
      replayTokenRef.current = token;

      const durationMs = Math.min(REPLAY_DURATION_CAP_MS, REPLAY_DURATION_TARGET_MS);
      const startedAt = performance.now();

      const renderFrame = (timestamp: number): void => {
        if (replayTokenRef.current !== token) {
          return;
        }
        const elapsed = timestamp - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        const revealCount = Math.max(
          1,
          Math.min(chunks.length, Math.ceil(progress * chunks.length))
        );
        const visible = chunks.slice(0, revealCount).join("");
        setReplayVisibleText(visible);

        if (progress >= 1 || revealCount >= chunks.length) {
          setReplayVisibleText(fullText);
          setReplayActive(false);
          replayActiveRef.current = false;
          setReplayTargetIndex(null);
          setReplayFullText("");
          replayAnimationIdRef.current = null;
          return;
        }

        replayAnimationIdRef.current = window.requestAnimationFrame(renderFrame);
      };

      replayAnimationIdRef.current = window.requestAnimationFrame(renderFrame);
    },
    [abortReplay]
  );

  const refreshSessionList = useCallback(async (currentSessionId: string): Promise<void> => {
    const result = await jsonFetch<{ sessions: readonly WebSessionListItemDTO[] }>(
      withSessionQuery("/api/sessions", currentSessionId)
    );
    setSessions(result.sessions);
  }, []);

  useEffect(() => {
    let disposed = false;

    const initialize = async (): Promise<void> => {
      let nextSessionId = sessionName;
      try {
        const initResult = await jsonFetch<{ sessionId: string }>(
          `/api/session/${encodeURIComponent(sessionName)}/init`
        );
        nextSessionId = initResult.sessionId;
      } catch (error) {
        if (!disposed) {
          setClientError(toMessage(error));
        }
      }

      if (disposed) {
        return;
      }
      setSessionId(nextSessionId);
      setSessionInitialized(true);
    };

    void initialize();
    return () => {
      disposed = true;
    };
  }, [sessionName]);

  useEffect(() => {
    if (!isSessionInitialized || sessionId.trim() === "") {
      return;
    }

    let disposed = false;

    const cleanupSse = (): void => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const connectSse = (currentSessionId: string): void => {
      cleanupSse();
      const stream = new EventSource(withSessionQuery("/api/stream", currentSessionId));
      eventSourceRef.current = stream;
      stream.onmessage = (event) => {
        const parsed = JSON.parse(event.data) as { snapshot?: GraphStateSnapshot };
        if (parsed.snapshot) {
          setSnapshot(parsed.snapshot);
        }
      };
      stream.onerror = () => {
        stream.close();
        eventSourceRef.current = null;
        reconnectTimerRef.current = window.setTimeout(() => {
          if (!disposed) {
            connectSse(currentSessionId);
          }
        }, RETRY_DELAY_MS);
      };
    };

    const syncState = async (): Promise<void> => {
      try {
        const stateResult = await jsonFetch<{ snapshot: GraphStateSnapshot }>(
          withSessionQuery("/api/state", sessionId)
        );
        if (!disposed) {
          setSnapshot(stateResult.snapshot);
        }
      } catch (error) {
        if (!disposed) {
          setClientError(toMessage(error));
        }
      }

      if (!disposed) {
        connectSse(sessionId);
      }
    };

    void syncState();
    void refreshSessionList(sessionId).catch((error) => {
      if (!disposed) {
        setSessionPanelError(toMessage(error));
      }
    });

    return () => {
      disposed = true;
      cleanupSse();
    };
  }, [isSessionInitialized, refreshSessionList, sessionId]);

  useEffect(() => {
    previousSnapshotRef.current = null;
    replaySignatureRef.current = null;
    abortReplay();
  }, [abortReplay, sessionId]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const previousSnapshot = previousSnapshotRef.current;
    previousSnapshotRef.current = snapshot;

    if (!previousSnapshot) {
      return;
    }

    if (
      previousSnapshot.sessionId !== snapshot.sessionId ||
      snapshot.history.length < previousSnapshot.history.length
    ) {
      replaySignatureRef.current = null;
    }

    if (replayActiveRef.current) {
      abortReplay();
    }

    if (previousSnapshot.history.length >= snapshot.history.length) {
      return;
    }
    if (snapshot.isBusy) {
      return;
    }

    const currentAssistant = resolveLastAssistant(snapshot.history);
    if (!currentAssistant) {
      return;
    }
    const previousAssistant = resolveLastAssistant(previousSnapshot.history);
    if (previousAssistant?.content === currentAssistant.content) {
      return;
    }

    const signature = `${snapshot.history.length}:${currentAssistant.content}`;
    if (replaySignatureRef.current === signature) {
      return;
    }

    startReplay(currentAssistant.index, currentAssistant.content, signature);
  }, [abortReplay, snapshot, startReplay]);

  const isBusy = snapshot?.isBusy ?? false;
  const history = snapshot?.history ?? [];
  const lastItem = history.length > 0 ? history[history.length - 1] : null;
  const showThinkingIndicator =
    Boolean(snapshot) &&
    !snapshot?.lastError &&
    snapshot?.isBusy === true &&
    lastItem?.role === "user";

  if (!snapshot && !clientError) {
    return (
      <main className="app">
        <section className="panel">
          <h1>LangGraph Observer v2</h1>
          <p>Loading...</p>
        </section>
      </main>
    );
  }

  const handleSend = async (): Promise<void> => {
    if (!sessionId || isBusy || inputText.trim() === "") return;
    if (replayActiveRef.current) {
      abortReplay();
    }
    setClientError("");
    try {
      const result = await jsonFetch<{ snapshot: GraphStateSnapshot }>(
        withSessionQuery("/api/chat", sessionId),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, text: inputText }),
        }
      );
      setSnapshot(result.snapshot);
      setInputText("");
      void refreshSessionList(sessionId).catch(() => undefined);
    } catch (error) {
      setClientError(toMessage(error));
    }
  };

  const handleReset = async (): Promise<void> => {
    if (!sessionId || isBusy) return;
    setClientError("");
    try {
      const result = await jsonFetch<{ snapshot: GraphStateSnapshot }>(
        withSessionQuery("/api/session/reset", sessionId),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        }
      );
      setSnapshot(result.snapshot);
      void refreshSessionList(sessionId).catch(() => undefined);
    } catch (error) {
      setClientError(toMessage(error));
    }
  };

  const handleRerun = async (): Promise<void> => {
    if (!sessionId || isBusy) return;
    setClientError("");
    try {
      const result = await jsonFetch<{ snapshot: GraphStateSnapshot }>(
        withSessionQuery("/api/rerun", sessionId),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, text: inputText }),
        }
      );
      setSnapshot(result.snapshot);
      void refreshSessionList(sessionId).catch(() => undefined);
    } catch (error) {
      setClientError(toMessage(error));
    }
  };

  const handleSessionSwitch = useCallback(
    async (nextSessionId: string): Promise<void> => {
      if (!sessionId) {
        return;
      }
      setSessionPanelError("");
      try {
        const switched = await jsonFetch<WebSessionSwitchResultDTO>(
          withSessionQuery("/api/session/switch", sessionId),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: nextSessionId }),
          }
        );
        setSnapshot(null);
        setSessionId(switched.currentSessionId);
        await refreshSessionList(switched.currentSessionId);
      } catch (error) {
        const message = toMessage(error);
        setSessionPanelError(message);
        if (message === "FORBIDDEN" || message === "SESSION_NOT_FOUND") {
          await refreshSessionList(sessionId).catch(() => undefined);
        }
      }
    },
    [refreshSessionList, sessionId]
  );

  const handleSessionDelete = useCallback(
    async (targetSessionId: string): Promise<void> => {
      if (!sessionId) {
        return;
      }
      setSessionPanelError("");
      try {
        const deleted = await jsonFetch<WebSessionDeleteResultDTO>(
          withSessionQuery(`/api/session/${encodeURIComponent(targetSessionId)}`, sessionId),
          {
            method: "DELETE",
          }
        );
        if (deleted.newActiveSessionId) {
          setSnapshot(null);
          setSessionId(deleted.newActiveSessionId);
          await refreshSessionList(deleted.newActiveSessionId);
          return;
        }
        await refreshSessionList(sessionId);
      } catch (error) {
        const message = toMessage(error);
        if (message === "ENGINE_BUSY") {
          setSessionPanelError("ENGINE_BUSY");
        } else {
          setSessionPanelError(message);
        }
        if (message === "FORBIDDEN" || message === "SESSION_NOT_FOUND") {
          await refreshSessionList(sessionId).catch(() => undefined);
        }
      }
    },
    [refreshSessionList, sessionId]
  );

  return (
    <main className="app">
      <header className="topbar">
        <h1>LangGraph Observer v2</h1>
        <div className="actions">
          <span className="session-label">session: {sessionId || "UNAVAILABLE"}</span>
          <button
            type="button"
            className="secondary"
            onClick={() => setDevOverlayVisible((prev) => !prev)}
          >
            Toggle Dev Overlay
          </button>
        </div>
      </header>

      <SessionPanel
        sessions={sessions}
        currentSessionId={sessionId}
        isBusy={isBusy}
        errorMessage={sessionPanelError}
        onRefresh={() => {
          void refreshSessionList(sessionId).catch((error) => {
            setSessionPanelError(toMessage(error));
          });
        }}
        onSwitch={(targetSessionId) => {
          void handleSessionSwitch(targetSessionId);
        }}
        onDelete={(targetSessionId) => {
          void handleSessionDelete(targetSessionId);
        }}
      />

      <section className="panel chips">
        <span className="chip">Mode: {snapshot?.mode ?? "UNAVAILABLE"}</span>
        <span className="chip">Domain: {snapshot?.domain ?? "UNAVAILABLE"}</span>
        <span className="chip">Provider: {snapshot?.activeProvider ?? "UNAVAILABLE"}</span>
        <span className="chip">Model: {snapshot?.activeModel ?? "UNAVAILABLE"}</span>
        <span className="chip">Secret: {snapshot?.secretProfileLabel ?? "UNAVAILABLE"}</span>
        <span className="chip">Busy: {String(snapshot?.isBusy ?? false)}</span>
        <span className="chip">Step: {snapshot?.currentStepLabel ?? "UNAVAILABLE"}</span>
      </section>

      <section className="panel">
        <label htmlFor="input">Input</label>
        <textarea
          id="input"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          disabled={isBusy}
          placeholder="Enter prompt..."
        />
        <div className="actions">
          <button type="button" onClick={() => void handleSend()} disabled={isBusy}>
            Send
          </button>
          <button type="button" className="warn" onClick={() => void handleReset()} disabled={isBusy}>
            Session Reset
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void handleRerun()}
            disabled={isBusy}
          >
            Rerun from Start
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Timeline</h2>
        <Timeline
          history={history}
          replayActive={replayActive}
          replayTargetIndex={replayTargetIndex}
          replayFullText={replayFullText}
          replayVisibleText={replayVisibleText}
          showThinkingIndicator={showThinkingIndicator}
          currentStepLabel={snapshot?.currentStepLabel}
        />
      </section>

      {(snapshot?.lastError || clientError) ? (
        <section className="panel error">
          <h2>Last Error</h2>
          {snapshot?.lastError ? (
            <pre>{`${snapshot.lastError.errorCode}\n${snapshot.lastError.guideMessage}`}</pre>
          ) : null}
          {clientError ? <pre>{clientError}</pre> : null}
        </section>
      ) : null}

      {isDevOverlayVisible ? (
        <section className="panel dev-overlay">
          <h2>Dev Overlay</h2>
          <pre>{JSON.stringify(snapshot, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  );
}
