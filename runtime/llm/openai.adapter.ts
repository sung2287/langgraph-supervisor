import { LLMClient } from "./llm.types";

export class OpenAIAdapter implements LLMClient {
  async generate(prompt: string): Promise<string> {
    return `API_RESPONSE:\n${prompt.slice(0, 200)}`;
  }
}
