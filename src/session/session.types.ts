export interface SessionState {
  readonly sessionId: string;
  readonly memoryRef: string;
  readonly repoScanVersion: string;
  readonly lastExecutionPlanHash: string;
  readonly updatedAt: string;
}

export interface SessionStore {
  load(): SessionState | null;
  verify(expectedHash: string): void;
  save(next: SessionState): void;
}
