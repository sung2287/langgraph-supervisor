export interface HistoryItem {
  readonly role: string;
  readonly content: string;
}

export interface WebErrorDTO {
  readonly errorCode: string;
  readonly guideMessage: string;
}

export interface GraphStateSnapshot {
  readonly sessionId: string;
  readonly mode: string;
  readonly domain: string;
  readonly activeProvider: string;
  readonly activeModel: string;
  readonly secretProfileLabel: string;
  readonly history: readonly HistoryItem[];
  readonly currentStepLabel?: string;
  readonly isBusy: boolean;
  readonly lastError?: WebErrorDTO;
}

export interface WebSessionContext {
  readonly sessionId: string;
  readonly sessionFilename: string;
}

export interface WebSessionListItemDTO {
  readonly sessionId: string;
  readonly lastUserMessagePreview?: string;
  readonly lastUpdatedAt: number;
  readonly isActive: boolean;
}

export interface WebSessionDeleteResultDTO {
  readonly deletedSessionId: string;
  readonly newActiveSessionId?: string;
  readonly status: string;
}

export interface WebSessionSwitchResultDTO {
  readonly currentSessionId: string;
  readonly status: string;
}

export interface WebSubmitInput {
  readonly sessionId: string;
  readonly text: string;
  readonly provider?: string;
  readonly model?: string;
  readonly profile?: string;
  readonly secretProfile?: string;
  readonly phase?: string;
  readonly domain?: string;
}

export interface WebRerunInput {
  readonly sessionId: string;
  readonly text?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly profile?: string;
  readonly secretProfile?: string;
  readonly phase?: string;
  readonly domain?: string;
}

export interface IWebRuntimeAdapter {
  initWebSession(sessionId: string): Promise<WebSessionContext>;
  getCurrentState(sessionId: string): Promise<GraphStateSnapshot>;
  listWebSessions(sessionHint?: string): Promise<readonly WebSessionListItemDTO[]>;
  switchWebSession(sessionId: string): Promise<WebSessionSwitchResultDTO>;
  deleteWebSession(sessionId: string): Promise<WebSessionDeleteResultDTO>;
  submitInput(input: WebSubmitInput): Promise<GraphStateSnapshot>;
  resetSession(sessionId: string): Promise<GraphStateSnapshot>;
  rerunFromStart(input: WebRerunInput): Promise<GraphStateSnapshot>;
  subscribe(
    sessionId: string,
    listener: (snapshot: GraphStateSnapshot) => void
  ): () => void;
}
