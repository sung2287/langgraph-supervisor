/**
 * Intent: PRD-011 secret path resolution must choose HOME on Unix and USERPROFILE on Windows.
 * Scope: `resolveSecretsFilePath` behavior for platform/env-specific home directory selection.
 * Non-Goals: Runtime profile loading and provider injection behavior.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveSecretsFilePath } from "../../../runtime/secrets/secret.paths";

test("secret paths: linux/mac resolve with HOME", () => {
  const linuxPath = resolveSecretsFilePath({
    platform: "linux",
    env: { HOME: "/tmp/user-home" } as NodeJS.ProcessEnv,
  });
  const macPath = resolveSecretsFilePath({
    platform: "darwin",
    env: { HOME: "/Users/example" } as NodeJS.ProcessEnv,
  });

  assert.equal(
    linuxPath,
    path.join("/tmp/user-home", ".langgraph-orchestration", "secrets.json")
  );
  assert.equal(
    macPath,
    path.join("/Users/example", ".langgraph-orchestration", "secrets.json")
  );
});

test("secret paths: windows resolve with USERPROFILE", () => {
  const windowsPath = resolveSecretsFilePath({
    platform: "win32",
    env: { USERPROFILE: "C:\\Users\\example" } as NodeJS.ProcessEnv,
  });

  assert.equal(
    windowsPath,
    path.win32.join("C:\\Users\\example", ".langgraph-orchestration", "secrets.json")
  );
});
