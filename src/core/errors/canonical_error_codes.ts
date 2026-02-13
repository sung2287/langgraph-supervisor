export const ERROR_CODES = {
  E_CORE_INVALID_INPUT: "E_CORE_INVALID_INPUT",
  E_CORE_STATE_VIOLATION: "E_CORE_STATE_VIOLATION",
  E_CORE_INVARIANT_BROKEN: "E_CORE_INVARIANT_BROKEN",
  E_CONTRACT_MISMATCH: "E_CONTRACT_MISMATCH",
  E_ADAPTER_VALIDATION: "E_ADAPTER_VALIDATION",
  E_INTERNAL_ERROR: "E_INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface CoreErrorShape {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}
