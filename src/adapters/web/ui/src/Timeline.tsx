import type { HistoryItem } from "../../web.types";

interface TimelineProps {
  readonly history: readonly HistoryItem[];
  readonly replayActive: boolean;
  readonly replayTargetIndex: number | null;
  readonly replayFullText: string;
  readonly replayVisibleText: string;
  readonly showThinkingIndicator: boolean;
  readonly currentStepLabel?: string;
}

function resolveMessageType(item: HistoryItem): string {
  const maybeType = (item as unknown as { type?: unknown }).type;
  if (typeof maybeType === "string" && maybeType.trim() !== "") {
    return maybeType;
  }
  return "text";
}

function bubbleClass(role: string): string {
  if (role === "user") {
    return "timeline-bubble timeline-bubble-user";
  }
  if (role === "assistant") {
    return "timeline-bubble timeline-bubble-assistant";
  }
  return "timeline-bubble";
}

function resolveContent(props: TimelineProps, index: number, content: string): string {
  if (!props.replayActive || props.replayTargetIndex !== index) {
    return content;
  }
  if (props.replayFullText !== content) {
    return content;
  }
  return props.replayVisibleText;
}

export function Timeline(props: TimelineProps): JSX.Element {
  return (
    <ul className="timeline">
      {props.history.map((item, index) => (
        <li key={`timeline-${index}`} className={`timeline-row timeline-row-${item.role}`}>
          <article className={bubbleClass(item.role)}>
            <div className="meta">
              <strong>{item.role}</strong>
              <span className="type-tag">{resolveMessageType(item)}</span>
            </div>
            <pre>{resolveContent(props, index, item.content)}</pre>
          </article>
        </li>
      ))}

      {props.showThinkingIndicator ? (
        <li key="thinking-indicator" className="timeline-row timeline-row-assistant">
          <article className="timeline-bubble timeline-bubble-assistant thinking-bubble">
            <div className="meta">
              <strong>assistant</strong>
              <span className="type-tag">thinking</span>
            </div>
            <div className="thinking-indicator" aria-label="Assistant is thinking">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </div>
            {typeof props.currentStepLabel === "string" && props.currentStepLabel !== "" ? (
              <small className="step-label">{props.currentStepLabel}</small>
            ) : null}
          </article>
        </li>
      ) : null}
    </ul>
  );
}
