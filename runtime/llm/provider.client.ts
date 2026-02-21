import type { LLMClient } from "./llm.types";
import type { ProviderConfig } from "./provider.config";
import { GeminiAdapter } from "./gemini.adapter";
import { LocalLLMClient } from "./local.adapter";
import { OpenAIAdapter } from "./openai.adapter";

export function createLLMClientFromProviderConfig(
  config: ProviderConfig,
  env: NodeJS.ProcessEnv = process.env
): LLMClient {
  if (config.provider === "ollama") {
    return new LocalLLMClient();
  }
  if (config.provider === "openai") {
    return new OpenAIAdapter();
  }
  return new GeminiAdapter(config, env);
}
