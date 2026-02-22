import type { WebSessionListItemDTO } from "../../web.types";

interface SessionPanelProps {
  readonly sessions: readonly WebSessionListItemDTO[];
  readonly currentSessionId: string;
  readonly isBusy: boolean;
  readonly errorMessage: string;
  readonly onRefresh: () => void;
  readonly onSwitch: (sessionId: string) => void;
  readonly onDelete: (sessionId: string) => void;
}

function formatUpdatedAt(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "Unknown";
  }
  return new Date(value).toLocaleString();
}

export function SessionPanel(props: SessionPanelProps): JSX.Element {
  return (
    <section className="panel">
      <div className="session-panel-head">
        <h2>Sessions</h2>
        <button type="button" className="secondary" onClick={props.onRefresh} disabled={props.isBusy}>
          Refresh
        </button>
      </div>

      {props.errorMessage ? <div className="session-panel-error">{props.errorMessage}</div> : null}

      <ul className="session-list">
        {props.sessions.map((session) => {
          const active = session.isActive || session.sessionId === props.currentSessionId;
          return (
            <li
              key={session.sessionId}
              className={`session-item${active ? " session-item-active" : ""}`}
            >
              <button
                type="button"
                className="session-select"
                onClick={() => props.onSwitch(session.sessionId)}
                disabled={props.isBusy}
              >
                <span className="session-id">{session.sessionId}</span>
                <span className="session-preview">
                  {session.lastUserMessagePreview ?? "(no preview)"}
                </span>
                <span className="session-time">{formatUpdatedAt(session.lastUpdatedAt)}</span>
              </button>
              <button
                type="button"
                className="warn"
                onClick={() => props.onDelete(session.sessionId)}
                disabled={props.isBusy}
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
