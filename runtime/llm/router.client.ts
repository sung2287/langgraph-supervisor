import { LLMClient } from "./llm.types";

export type LLMMode = "local" | "api" | "auto";

interface RouterConfig {
  mode: LLMMode;
  promptLengthThreshold: number;
}

export class RouterLLMClient implements LLMClient {
  private readonly mode: LLMMode;
  private readonly threshold: number;
  private readonly local: LLMClient;
  private readonly api: LLMClient;

  constructor(
    config: RouterConfig,
    localClient: LLMClient,
    apiClient: LLMClient
  ) {
    this.mode = config.mode;
    this.threshold = config.promptLengthThreshold;
    this.local = localClient;
    this.api = apiClient;
  }

  async generate(prompt: string): Promise<string> {
    const client = this.selectClient(prompt);
    return client.generate(prompt);
  }

  private selectClient(prompt: string): LLMClient {
    if (this.mode === "local") return this.local;
    if (this.mode === "api") return this.api;

    if (prompt.includes("#use_api")) return this.api;
    if (prompt.length > this.threshold) return this.api;

    return this.local;
  }
}
