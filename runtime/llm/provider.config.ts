export type ProviderId = "ollama" | "gemini" | "openai";

export interface ProviderConfig {
  readonly provider: ProviderId;
  readonly model?: string;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly backoffMs: readonly number[];
}
