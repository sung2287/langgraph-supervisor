export const RUNTIME_ERROR_CODES = Object.freeze({
  SESSION_CONFLICT: "SESSION_CONFLICT",
  PLAN_HASH_MISMATCH: "PLAN_HASH_MISMATCH",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  RUNTIME_FAILED: "RUNTIME_FAILED",
} as const);

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[keyof typeof RUNTIME_ERROR_CODES];

export interface RuntimeErrorPayload {
  readonly errorCode: RuntimeErrorCode;
  readonly guideMessage: string;
}

export class RuntimeError extends Error {
  readonly errorCode: RuntimeErrorCode;
  readonly guideMessage: string;
  readonly httpStatus: number;

  constructor(
    message: string,
    input: {
      readonly errorCode: RuntimeErrorCode;
      readonly guideMessage: string;
      readonly httpStatus: number;
      readonly cause?: unknown;
    }
  ) {
    super(message);
    this.name = "RuntimeError";
    this.errorCode = input.errorCode;
    this.guideMessage = input.guideMessage;
    this.httpStatus = input.httpStatus;
    if ("cause" in input) {
      (this as Error & { cause?: unknown }).cause = input.cause;
    }
  }
}

function asMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function createSessionConflictError(sessionId: string): RuntimeError {
  return new RuntimeError(`SESSION_CONFLICT session=${sessionId}`, {
    errorCode: RUNTIME_ERROR_CODES.SESSION_CONFLICT,
    guideMessage: "abort_with_error(session_conflict)",
    httpStatus: 409,
  });
}

export function toRuntimeError(error: unknown): RuntimeError {
  if (error instanceof RuntimeError) {
    return error;
  }

  const message = asMessage(error);
  if (message.startsWith("SESSION_STATE_HASH_MISMATCH")) {
    return new RuntimeError(message, {
      errorCode: RUNTIME_ERROR_CODES.PLAN_HASH_MISMATCH,
      guideMessage: "abort_with_guide(web_session_expired_confirm)",
      httpStatus: 409,
      cause: error,
    });
  }

  if (message.includes("CONFIGURATION_ERROR")) {
    return new RuntimeError(message, {
      errorCode: RUNTIME_ERROR_CODES.CONFIGURATION_ERROR,
      guideMessage: "abort_with_error(configuration_invalid)",
      httpStatus: 400,
      cause: error,
    });
  }

  return new RuntimeError(message, {
    errorCode: RUNTIME_ERROR_CODES.RUNTIME_FAILED,
    guideMessage: "abort_with_error(runtime_failed)",
    httpStatus: 500,
    cause: error,
  });
}
