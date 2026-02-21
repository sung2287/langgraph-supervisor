import { LLMClient } from "./llm.types";
import type { ProviderConfig } from "./provider.config";
import { ConfigurationError } from "./errors";

const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyHttpStatus(status: number): {
  readonly code: string;
  readonly isTransient: boolean;
} {
  if (status === 401 || status === 403) {
    return { code: `GEMINI_PERMANENT_HTTP_${status}`, isTransient: false };
  }
  if (status === 429 || status === 503) {
    return { code: `GEMINI_TRANSIENT_HTTP_${status}`, isTransient: true };
  }
  return { code: `GEMINI_HTTP_${status}`, isTransient: false };
}

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function extractResponseText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const first = candidates[0];
  if (typeof first !== "object" || first === null) {
    return null;
  }

  const content = (first as { content?: unknown }).content;
  if (typeof content !== "object" || content === null) {
    return null;
  }

  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) {
    return null;
  }

  const text = parts
    .map((part) => {
      if (typeof part !== "object" || part === null) {
        return "";
      }
      return sanitizeText((part as { text?: unknown }).text);
    })
    .join("")
    .trim();

  return text === "" ? null : text;
}

export class GeminiAdapter implements LLMClient {
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: readonly number[];
  private readonly apiKey: string;

  constructor(config: ProviderConfig, env: NodeJS.ProcessEnv = process.env) {
    this.model = config.model ?? DEFAULT_GEMINI_MODEL;
    this.timeoutMs = config.timeoutMs;
    this.maxAttempts = config.maxAttempts;
    this.backoffMs = config.backoffMs;

    const apiKey = env.GEMINI_API_KEY;
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      throw new ConfigurationError(
        "CONFIGURATION_ERROR GEMINI_API_KEY is required when provider=gemini"
      );
    }
    this.apiKey = apiKey;
  }

  async generate(prompt: string): Promise<string> {
    const endpoint = `${GEMINI_API_BASE}/models/${encodeURIComponent(this.model)}:generateContent`;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (attempt > 1) {
        const delayMs = this.backoffMs[Math.min(attempt - 2, this.backoffMs.length - 1)] ?? 0;
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const { code, isTransient } = classifyHttpStatus(response.status);
          if (isTransient && attempt < this.maxAttempts) {
            continue;
          }
          throw new Error(`${code}: request failed`);
        }

        const payload = (await response.json()) as unknown;
        const text = extractResponseText(payload);
        if (!text) {
          throw new Error("GEMINI_BAD_RESPONSE: missing text response");
        }

        return text;
      } catch (error) {
        const isAbort =
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && /abort/i.test(error.name));
        if (isAbort) {
          if (attempt < this.maxAttempts) {
            continue;
          }
          throw new Error("GEMINI_TIMEOUT");
        }

        const message = error instanceof Error ? error.message : String(error);
        const isTransientError =
          /GEMINI_TRANSIENT_HTTP_/.test(message) || /fetch failed/i.test(message);
        if (isTransientError && attempt < this.maxAttempts) {
          continue;
        }

        if (message.includes("GEMINI_PERMANENT_HTTP_401") || message.includes("GEMINI_PERMANENT_HTTP_403")) {
          throw new Error(message);
        }

        if (/GEMINI_/.test(message)) {
          throw new Error(message);
        }

        throw new Error(`GEMINI_REQUEST_FAILED: ${message}`);
      } finally {
        clearTimeout(timer);
      }
    }

    throw new Error("GEMINI_REQUEST_FAILED: retries exhausted");
  }
}
