import test from "node:test";
import assert from "node:assert/strict";
import { LocalLLMClient } from "../../../agent/llm/local.adapter";

function makeOkResponse(responseText: string): Response {
  return {
    ok: true,
    status: 200,
    async json() {
      return { response: responseText };
    },
    async text() {
      return "";
    },
  } as unknown as Response;
}

test("LocalLLMClient chooses model from env with qwen3:8b fallback", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.OLLAMA_MODEL;
  const capturedModels: string[] = [];

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    capturedModels.push(String(body.model ?? ""));
    return makeOkResponse("ok");
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) {
      delete process.env.OLLAMA_MODEL;
    } else {
      process.env.OLLAMA_MODEL = originalModel;
    }
  });

  const client = new LocalLLMClient();

  delete process.env.OLLAMA_MODEL;
  await client.generate("env missing");

  process.env.OLLAMA_MODEL = "llama3";
  await client.generate("env set");

  process.env.OLLAMA_MODEL = "   ";
  await client.generate("env blank");

  assert.deepEqual(capturedModels, ["qwen3:8b", "llama3", "qwen3:8b"]);
});
