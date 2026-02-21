import type { ProviderConfig, ProviderId } from "./provider.config";
import { ConfigurationError } from "./errors";

export interface ProviderResolutionArgs {
  readonly provider?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

export interface ProviderResolutionEnv {
  readonly LLM_PROVIDER?: string;
  readonly LLM_MODEL?: string;
  readonly LLM_TIMEOUT_MS?: string;
  readonly LLM_MAX_ATTEMPTS?: string;
  readonly GEMINI_API_KEY?: string;
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = [500, 1000] as const;
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

function parseProvider(value: string): ProviderId {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ollama" || normalized === "gemini" || normalized === "openai") {
    return normalized;
  }
  throw new ConfigurationError(
    `CONFIGURATION_ERROR unsupported provider='${value}'. expected one of: ollama|gemini|openai`
  );
}

function parseIntegerOption(value: unknown, field: string): number | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  const num = typeof value === "number" ? value : Number(String(value));
  if (!Number.isInteger(num)) {
    throw new ConfigurationError(`CONFIGURATION_ERROR ${field} must be an integer`);
  }
  return num;
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function buildBackoffSchedule(maxAttempts: number): readonly number[] {
  if (maxAttempts <= 1) {
    return [];
  }
  return DEFAULT_BACKOFF_MS.slice(0, Math.max(0, maxAttempts - 1));
}

export function resolveProviderConfig(
  args: ProviderResolutionArgs,
  env: ProviderResolutionEnv
): ProviderConfig {
  const providerRaw = toTrimmedString(args.provider) ?? toTrimmedString(env.LLM_PROVIDER);
  if (!providerRaw) {
    throw new ConfigurationError(
      "CONFIGURATION_ERROR provider must be set via --provider or LLM_PROVIDER"
    );
  }
  const provider = parseProvider(providerRaw);

  const timeoutMsRaw =
    typeof args.timeoutMs === "number"
      ? parseIntegerOption(args.timeoutMs, "timeoutMs")
      : parseIntegerOption(env.LLM_TIMEOUT_MS, "timeoutMs");
  const timeoutMs = timeoutMsRaw ?? DEFAULT_TIMEOUT_MS;
  if (timeoutMs <= 0) {
    throw new ConfigurationError("CONFIGURATION_ERROR timeoutMs must be > 0");
  }

  const maxAttemptsRaw =
    typeof args.maxAttempts === "number"
      ? parseIntegerOption(args.maxAttempts, "maxAttempts")
      : parseIntegerOption(env.LLM_MAX_ATTEMPTS, "maxAttempts");
  const maxAttempts = maxAttemptsRaw ?? DEFAULT_MAX_ATTEMPTS;
  if (maxAttempts < 1) {
    throw new ConfigurationError("CONFIGURATION_ERROR maxAttempts must be >= 1");
  }

  const explicitModel = toTrimmedString(args.model) ?? toTrimmedString(env.LLM_MODEL);
  const model = provider === "gemini" ? explicitModel ?? DEFAULT_GEMINI_MODEL : explicitModel;

  if (provider === "gemini") {
    const key = toTrimmedString(env.GEMINI_API_KEY);
    if (!key) {
      throw new ConfigurationError(
        "CONFIGURATION_ERROR GEMINI_API_KEY is required when provider=gemini"
      );
    }
  }

  return {
    provider,
    model,
    timeoutMs,
    maxAttempts,
    backoffMs: buildBackoffSchedule(maxAttempts),
  };
}
