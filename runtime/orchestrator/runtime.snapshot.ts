import { FileSessionStore } from "../../src/session/file_session.store";
import type { SessionState } from "../../src/session/session.types";

export interface RuntimeSessionSnapshot {
  readonly exists: boolean;
  readonly state: SessionState | null;
}

export function getRuntimeSessionSnapshot(
  repoPath: string,
  sessionFilename: string
): RuntimeSessionSnapshot {
  const store = new FileSessionStore(repoPath, { filename: sessionFilename });
  const state = store.load();
  return {
    exists: state !== null,
    state,
  };
}

export function resetRuntimeSession(repoPath: string, sessionFilename: string): void {
  const store = new FileSessionStore(repoPath, { filename: sessionFilename });
  store.prepareFreshSession();
}
