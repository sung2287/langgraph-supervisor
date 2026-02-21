export class CycleFailError extends Error {
  readonly kind = "CycleFail";
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "CycleFailError";
    this.cause = options?.cause;
  }
}

export class FailFastError extends Error {
  readonly kind = "FailFast";
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "FailFastError";
    this.cause = options?.cause;
  }
}
