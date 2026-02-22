import type {
  GraphStateSnapshot,
  HistoryItem,
  WebErrorDTO,
} from "../../src/adapters/web/web.types";

const UNAVAILABLE = "UNAVAILABLE";

export interface RuntimeObserverState {
  readonly mode?: string;
  readonly domain?: string;
  readonly activeProvider?: string;
  readonly activeModel?: string;
  readonly secretProfileLabel?: string;
  readonly history?: readonly HistoryItem[];
  readonly currentStepLabel?: string;
  readonly lastError?: WebErrorDTO;
}

function pickString(value: string | undefined): string {
  if (typeof value !== "string" || value.trim() === "") {
    return UNAVAILABLE;
  }
  return value;
}

export function mapToGraphStateSnapshot(input: {
  readonly sessionId: string;
  readonly isBusy: boolean;
  readonly observerState?: RuntimeObserverState;
}): GraphStateSnapshot {
  const state = input.observerState;
  const history = Array.isArray(state?.history) ? [...state.history] : [];

  return {
    sessionId: input.sessionId,
    mode: pickString(state?.mode),
    domain: pickString(state?.domain),
    activeProvider: pickString(state?.activeProvider),
    activeModel: pickString(state?.activeModel),
    secretProfileLabel: pickString(state?.secretProfileLabel),
    history,
    currentStepLabel: pickString(state?.currentStepLabel),
    isBusy: input.isBusy,
    lastError: state?.lastError,
  };
}
