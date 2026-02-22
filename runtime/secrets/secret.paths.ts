import path from "node:path";
import { ConfigurationError } from "../llm/errors";

export const SECRETS_DIRNAME = ".langgraph-orchestration";
export const SECRETS_FILENAME = "secrets.json";

export interface SecretPathOptions {
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
}

function resolveHomeDirectory(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  if (platform === "win32") {
    const home = env.USERPROFILE?.trim();
    if (home) {
      return home;
    }
    throw new ConfigurationError(
      "CONFIGURATION_ERROR USERPROFILE is required to resolve secret storage path on Windows"
    );
  }

  const home = env.HOME?.trim();
  if (home) {
    return home;
  }
  throw new ConfigurationError(
    "CONFIGURATION_ERROR HOME is required to resolve secret storage path on this platform"
  );
}

export function resolveSecretsDirectory(options: SecretPathOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = resolveHomeDirectory(platform, env);
  if (platform === "win32") {
    return path.win32.join(homeDir, SECRETS_DIRNAME);
  }
  return path.join(homeDir, SECRETS_DIRNAME);
}

export function resolveSecretsFilePath(options: SecretPathOptions = {}): string {
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    return path.win32.join(resolveSecretsDirectory(options), SECRETS_FILENAME);
  }
  return path.join(resolveSecretsDirectory(options), SECRETS_FILENAME);
}
