export class ConfigurationError extends Error {
  readonly kind = "ConfigurationError";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ConfigurationError";
    if (options && "cause" in options) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}
