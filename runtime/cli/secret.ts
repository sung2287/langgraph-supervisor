import { ConfigurationError } from "../llm/errors";
import { pathToFileURL } from "node:url";
import { FileSecretManager } from "../secrets/secret.manager";
import { redactSecretValue } from "../secrets/secret.redaction";

export interface SecretCliIo {
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

function usage(): string {
  return "Usage: secret set <profile> <provider> <apiKey>";
}

export async function runSecretCli(
  argv: readonly string[],
  io: SecretCliIo = {
    log: (message) => console.log(message),
    error: (message) => console.error(message),
  }
): Promise<number> {
  const [command, profile, provider, apiKey] = argv;
  if (command !== "set") {
    io.error(`secret command not supported. ${usage()}`);
    return 1;
  }

  if (
    typeof profile !== "string" ||
    typeof provider !== "string" ||
    typeof apiKey !== "string"
  ) {
    io.error(`secret set requires profile, provider, and apiKey. ${usage()}`);
    return 1;
  }

  const manager = new FileSecretManager();
  await manager.setSecret({
    profileName: profile,
    providerName: provider,
    apiKey,
  });

  io.log(
    `secret set completed profile=${profile.trim()} provider=${provider.trim()} apiKey=${redactSecretValue(apiKey)} path=${manager.getSecretsFilePath()}`
  );
  return 0;
}

async function main(): Promise<void> {
  try {
    const exitCode = await runSecretCli(process.argv.slice(2));
    process.exitCode = exitCode;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(`secret configuration error: ${error.message}`);
      process.exitCode = 1;
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`secret command failed: ${message}`);
    process.exitCode = 1;
  }
}

function isEntrypoint(): boolean {
  const scriptPath = process.argv[1];
  if (typeof scriptPath !== "string" || scriptPath.trim() === "") {
    return false;
  }
  return import.meta.url === pathToFileURL(scriptPath).href;
}

if (isEntrypoint()) {
  await main();
}
