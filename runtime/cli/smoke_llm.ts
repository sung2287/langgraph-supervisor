import { ConfigurationError } from "../llm/errors";
import { createLLMClientFromProviderConfig } from "../llm/provider.client";
import { resolveProviderConfig } from "../llm/provider.router";

interface SmokeArgs {
  readonly provider?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

function parseNumericFlag(value: string | undefined): number | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseArgs(argv: readonly string[]): SmokeArgs {
  let provider: string | undefined;
  let model: string | undefined;
  let timeoutMs: number | undefined;
  let maxAttempts: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--provider") {
      provider = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--model") {
      model = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--timeoutMs") {
      timeoutMs = parseNumericFlag(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--maxAttempts") {
      maxAttempts = parseNumericFlag(argv[i + 1]);
      i += 1;
    }
  }

  return {
    provider,
    model,
    timeoutMs,
    maxAttempts,
  };
}

function resolveErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const [head] = message.split(":", 1);
  const normalized = (head ?? "").trim();
  if (/^[A-Z0-9_\-]+$/.test(normalized) && normalized !== "") {
    return normalized;
  }
  return "LLM_REQUEST_FAILED";
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const config = resolveProviderConfig(args, process.env);
  const llm = createLLMClientFromProviderConfig(config, process.env);

  const start = Date.now();
  try {
    const response = await llm.generate("Return the string: OK");
    const ok = typeof response === "string" && response.trim().length > 0;
    const latencyMs = Date.now() - start;

    console.log(`provider=${config.provider}`);
    console.log(`model=${config.model ?? "DEFAULT"}`);
    console.log(`latencyMs=${latencyMs}`);
    console.log(`ok=${String(ok)}`);

    if (!ok) {
      console.log("error.code=EMPTY_RESPONSE");
      process.exitCode = 1;
    }
  } catch (error) {
    const latencyMs = Date.now() - start;
    console.log(`provider=${config.provider}`);
    console.log(`model=${config.model ?? "DEFAULT"}`);
    console.log(`latencyMs=${latencyMs}`);
    console.log("ok=false");
    console.log(`error.code=${resolveErrorCode(error)}`);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  if (error instanceof ConfigurationError) {
    console.log("ok=false");
    console.log(`error.code=${error.kind}`);
    console.error(`smoke:llm configuration error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.log("ok=false");
  console.log("error.code=SMOKE_RUNTIME_ERROR");
  console.error(`smoke:llm failed: ${message}`);
  process.exitCode = 1;
});
