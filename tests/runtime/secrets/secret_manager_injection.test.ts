/**
 * Intent: PRD-011 runtime secret manager must fail-fast on missing config and inject GEMINI_API_KEY without mutating process.env.
 * Scope: `FileSecretManager` load/injection behavior and provider resolution wiring for gemini.
 * Non-Goals: End-to-end network calls to external LLM providers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileSecretManager } from "../../../runtime/secrets/secret.manager";
import { resolveProviderConfig } from "../../../runtime/llm/provider.router";
import { createLLMClientFromProviderConfig } from "../../../runtime/llm/provider.client";
import { ConfigurationError } from "../../../runtime/llm/errors";

function makeIsolatedHome(t: test.TestContext): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "secret-manager-home-"));
  t.after(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

function createManager(home: string): FileSecretManager {
  return new FileSecretManager({
    platform: "linux",
    env: { HOME: home } as NodeJS.ProcessEnv,
  });
}

test("missing secrets file: throws CONFIGURATION_ERROR with setup guide and no key leakage", async (t) => {
  const home = makeIsolatedHome(t);
  const manager = createManager(home);
  const rawApiKey = "RAW_KEY_SHOULD_NOT_LEAK";

  await assert.rejects(
    () => manager.loadProfile("default"),
    (error: unknown) => {
      assert.equal(error instanceof ConfigurationError, true);
      const message = error instanceof Error ? error.message : String(error);
      assert.equal(message.includes("CONFIGURATION_ERROR"), true);
      assert.equal(message.includes("secret.ts set"), true);
      assert.equal(message.includes(rawApiKey), false);
      return true;
    }
  );
});

test("missing profile: throws CONFIGURATION_ERROR", async (t) => {
  const home = makeIsolatedHome(t);
  const manager = createManager(home);
  await manager.setSecret({
    profileName: "teamA",
    providerName: "gemini",
    apiKey: "SETUP_ONLY_KEY",
  });

  await assert.rejects(
    () => manager.loadProfile("default"),
    (error: unknown) => {
      assert.equal(error instanceof ConfigurationError, true);
      const message = error instanceof Error ? error.message : String(error);
      assert.equal(message.includes("CONFIGURATION_ERROR"), true);
      assert.equal(message.includes("default"), true);
      return true;
    }
  );
});

test("gemini injection env: resolveProviderConfig and client creation succeed without process.env key", async (t) => {
  const home = makeIsolatedHome(t);
  const manager = createManager(home);
  const savedKey = "GEMINI_TEST_KEY_FROM_SECRET_PROFILE";
  await manager.setSecret({
    profileName: "default",
    providerName: "gemini",
    apiKey: savedKey,
  });

  const previousEnvKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  t.after(() => {
    if (typeof previousEnvKey === "string") {
      process.env.GEMINI_API_KEY = previousEnvKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  const profile = await manager.loadProfile("default");
  const injectionEnv = manager.getInjectionEnv(profile, "gemini");

  assert.equal(typeof process.env.GEMINI_API_KEY, "undefined");
  assert.equal(injectionEnv.GEMINI_API_KEY, savedKey);

  const providerConfig = resolveProviderConfig(
    {
      provider: "gemini",
    },
    {
      ...injectionEnv,
    }
  );
  const llmClient = createLLMClientFromProviderConfig(providerConfig, {
    ...injectionEnv,
  });

  assert.equal(providerConfig.provider, "gemini");
  assert.equal(typeof llmClient.generate, "function");
});
