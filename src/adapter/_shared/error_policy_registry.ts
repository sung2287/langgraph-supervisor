import { ERROR_CODES, type ErrorCode } from "../../core/errors/canonical_error_codes";

export interface ErrorMetadata {
  publicMessage: "Y" | "N";
  httpStatus: number;
  cliExitCode: number;
  retryable: boolean;
}

export const ERROR_POLICY_REGISTRY = {
  [ERROR_CODES.E_CORE_INVALID_INPUT]: {
    publicMessage: "Y",
    httpStatus: 422,
    cliExitCode: 1,
    retryable: false,
  },
  [ERROR_CODES.E_CORE_STATE_VIOLATION]: {
    publicMessage: "N",
    httpStatus: 409,
    cliExitCode: 1,
    retryable: false,
  },
  [ERROR_CODES.E_CORE_INVARIANT_BROKEN]: {
    publicMessage: "N",
    httpStatus: 500,
    cliExitCode: 2,
    retryable: false,
  },
  [ERROR_CODES.E_CONTRACT_MISMATCH]: {
    publicMessage: "N",
    httpStatus: 500,
    cliExitCode: 2,
    retryable: false,
  },
  [ERROR_CODES.E_ADAPTER_VALIDATION]: {
    publicMessage: "Y",
    httpStatus: 400,
    cliExitCode: 1,
    retryable: false,
  },
  [ERROR_CODES.E_INTERNAL_ERROR]: {
    publicMessage: "N",
    httpStatus: 500,
    cliExitCode: 2,
    retryable: false,
  },
} satisfies Record<ErrorCode, ErrorMetadata>;
