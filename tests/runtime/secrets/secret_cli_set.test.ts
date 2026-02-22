/**
 * Intent: PRD-011 `secret set` must atomically write home-scoped secrets.json and redact apiKey in logs.
 * Scope: CLI `runSecretCli` command success path, directory creation, JSON structure, and tmp-file cleanup.
 * Non-Goals: Runtime `run:local` graph execution behavior.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSecretCli } from "../../../runtime/cli/secret";
import { resolveSecretsFilePath } from "../../../runtime/secrets/secret.paths";

function makeTempHome(t: test.TestContext): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "secret-cli-home-"));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  t.after(() => {
    if (typeof prevHome === "string") {
      process.env.HOME = prevHome;
    } else {
      delete process.env.HOME;
    }
    if (typeof prevUserProfile === "string") {
      process.env.USERPROFILE = prevUserProfile;
    } else {
      delete process.env.USERPROFILE;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });

  return home;
}

test("secret set: creates parent dir and writes expected JSON structure atomically", async (t) => {
  const home = makeTempHome(t);
  const logs: string[] = [];
  const errors: string[] = [];
  const rawGeminiKey = "GEMINI_RAW_KEY_FOR_REDACTION_TEST";
  const rawOpenAIKey = "OPENAI_RAW_KEY_FOR_REDACTION_TEST";

  const exitCode1 = await runSecretCli(["set", "default", "gemini", rawGeminiKey], {
    log: (msg) => logs.push(msg),
    error: (msg) => errors.push(msg),
  });
  const exitCode2 = await runSecretCli(["set", "default", "openai", rawOpenAIKey], {
    log: (msg) => logs.push(msg),
    error: (msg) => errors.push(msg),
  });

  assert.equal(exitCode1, 0);
  assert.equal(exitCode2, 0);
  assert.deepEqual(errors, []);

  const secretsPath = resolveSecretsFilePath({
    env: { HOME: home, USERPROFILE: home } as NodeJS.ProcessEnv,
    platform: process.platform,
  });
  assert.equal(fs.existsSync(path.dirname(secretsPath)), true);
  assert.equal(fs.existsSync(secretsPath), true);

  const parsed = JSON.parse(fs.readFileSync(secretsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(parsed, {
    default: {
      providers: {
        gemini: { apiKey: rawGeminiKey },
        openai: { apiKey: rawOpenAIKey },
      },
    },
  });

  const leftovers = fs
    .readdirSync(path.dirname(secretsPath))
    .filter((name) => name.startsWith("secrets.json.tmp-"));
  assert.deepEqual(leftovers, []);

  const combinedLogs = logs.join("\n");
  assert.equal(combinedLogs.includes(rawGeminiKey), false);
  assert.equal(combinedLogs.includes(rawOpenAIKey), false);
  assert.equal(combinedLogs.includes("****"), true);
});
