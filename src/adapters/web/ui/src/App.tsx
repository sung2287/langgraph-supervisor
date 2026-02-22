import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphStateSnapshot, HistoryItem } from "../../web.types";

const DEFAULT_SESSION_NAME = "default";
const RETRY_DELAY_MS = 1500;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errorCode =
      typeof payload.errorCode === "string" ? payload.errorCode : "RUNTIME_FAILED";
    const guideMessage =
      typeof payload.guideMessage === "string" ? payload.guideMessage : "request_failed";
    const message = typeof payload.message === "string" ? payload.message : response.statusText;
    throw new Error(`${errorCode}: ${guideMessage}: ${message}`);
  }
  return payload as T;
}

function messageTypeLabel(item: HistoryItem): string {
  const maybeType = (item as unknown as { type?: unknown }).type;
  if (typeof maybeType === "string" && maybeType.trim() !== "") {
    return maybeType;
  }
  return "text";
}

function parseSessionNameFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("session");
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw;
  }
  return DEFAULT_SESSION_NAME;
}

export function App(): JSX.Element {
  const [sessionId, setSessionId] = useState("");
  const [snapshot, setSnapshot] = useState<GraphStateSnapshot | null>(null);
  const [inputText, setInputText] = useState("");
  const [clientError, setClientError] = useState("");
  const [isDevOverlayVisible, setDevOverlayVisible] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sessionName = useMemo(() => parseSessionNameFromLocation(), []);

  useEffect(() => {
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

    const connectSse = (nextSessionId: string): void => {
      cleanupSse();
      const stream = new EventSource(
        `/api/stream?session=${encodeURIComponent(nextSessionId)}`
      );
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
            connectSse(nextSessionId);
          }
        }, RETRY_DELAY_MS);
      };
    };

    const init = async (): Promise<void> => {
      try {
        const initResult = await jsonFetch<{ sessionId: string }>(
          `/api/session/${encodeURIComponent(sessionName)}/init`
        );
        if (disposed) return;

        const nextSessionId = initResult.sessionId;
        setSessionId(nextSessionId);
        const stateResult = await jsonFetch<{ snapshot: GraphStateSnapshot }>(
          `/api/state?session=${encodeURIComponent(nextSessionId)}`
        );
        if (disposed) return;
        setSnapshot(stateResult.snapshot);
        connectSse(nextSessionId);
      } catch (error) {
        if (!disposed) {
          setClientError(error instanceof Error ? error.message : String(error));
        }
      }
    };

    init().catch(() => undefined);
    return () => {
      disposed = true;
      cleanupSse();
    };
  }, [sessionName]);

  const isBusy = snapshot?.isBusy ?? false;

  const handleSend = async (): Promise<void> => {
    if (!sessionId || isBusy || inputText.trim() === "") return;
    setClientError("");
    try {
      const result = await jsonFetch<{ snapshot: GraphStateSnapshot }>("/api/input", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, text: inputText }),
      });
      setSnapshot(result.snapshot);
      setInputText("");
    } catch (error) {
      setClientError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleReset = async (): Promise<void> => {
    if (!sessionId || isBusy) return;
    setClientError("");
    try {
      const result = await jsonFetch<{ snapshot: GraphStateSnapshot }>("/api/session/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      setSnapshot(result.snapshot);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRerun = async (): Promise<void> => {
    if (!sessionId || isBusy) return;
    setClientError("");
    try {
      const result = await jsonFetch<{ snapshot: GraphStateSnapshot }>("/api/rerun", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, text: inputText }),
      });
      setSnapshot(result.snapshot);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : String(error));
    }
  };

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
        <ul className="timeline">
          {(snapshot?.history ?? []).map((item, index) => (
            <li key={`${item.role}-${index}`} className="timeline-item">
              <div className="meta">
                <strong>{item.role}</strong>
                <span className="type-tag">{messageTypeLabel(item)}</span>
              </div>
              <pre>{item.content}</pre>
            </li>
          ))}
        </ul>
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
