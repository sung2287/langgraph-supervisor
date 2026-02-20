import type { SessionState, SessionStore } from "./session.types";

export interface SessionLifecycleRunResult<TResult> {
  readonly success: boolean;
  readonly result: TResult;
  readonly nextSession?: SessionState;
}

export interface RunSessionLifecycleInput<TResult> {
  readonly store: SessionStore;
  readonly expectedHash: string;
  readonly run: (
    loadedSession: SessionState | null
  ) => Promise<SessionLifecycleRunResult<TResult>>;
}

export function shouldVerifyOnBoot(loaded: SessionState | null): boolean {
  return loaded !== null;
}

export async function runSessionLifecycle<TResult>(
  input: RunSessionLifecycleInput<TResult>
): Promise<{ loadedSession: SessionState | null; result: TResult }> {
  const loadedSession = input.store.load();
  if (shouldVerifyOnBoot(loadedSession)) {
    input.store.verify(input.expectedHash);
    const state = loadedSession;
    console.log(
      `[session] loaded session_state.json (sessionId=${state.sessionId})`
    );
  }

  const runResult = await input.run(loadedSession);
  if (runResult.success) {
    if (!runResult.nextSession) {
      throw new Error("SESSION_LIFECYCLE_ERROR nextSession is required when success=true");
    }
    input.store.save(runResult.nextSession);
    if (loadedSession === null) {
      const newState = runResult.nextSession;
      console.log(
        `[session] initialized new session (sessionId=${newState.sessionId})`
      );
    }
  }

  return {
    loadedSession,
    result: runResult.result,
  };
}
