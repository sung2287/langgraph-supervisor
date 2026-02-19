import { LLMClient } from "./llm.types";

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}

export class LocalLLMClient implements LLMClient {
  async generate(prompt: string): Promise<string> {
    const baseUrl = env("OLLAMA_BASE_URL", "http://localhost:11434");
    const model = env("OLLAMA_MODEL", "qwen2.5:7b-instruct");
    const timeoutMs = Number(env("OLLAMA_TIMEOUT_MS", "60000"));

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt, stream: false }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`OLLAMA_HTTP_${res.status}: ${text.slice(0, 300)}`);
      }

      const data: unknown = await res.json();
      const maybeResponse =
        typeof data === "object" && data !== null
          ? (data as { response?: unknown }).response
          : undefined;

      if (typeof maybeResponse !== "string") {
        throw new Error("OLLAMA_BAD_RESPONSE: missing string 'response'");
      }

      return maybeResponse;
    } finally {
      clearTimeout(t);
    }
  }
}
