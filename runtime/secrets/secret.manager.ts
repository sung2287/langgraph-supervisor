import fs from "node:fs/promises";
import { ConfigurationError } from "../llm/errors";
import {
  canonicalizeProviderForStorage,
  type ProviderResolutionEnv,
} from "../llm/provider.router";
import { writeFileAtomically } from "./secret.atomic_write";
import { resolveSecretsFilePath } from "./secret.paths";
import type { SecretProfile, SecretProviderEntry, SecretStore } from "./secret.schema";
import { validateSecretStore } from "./secret.schema";

const SECRET_SET_GUIDE =
  "Run: node --import tsx runtime/cli/secret.ts set <profile> <provider> <apiKey>";
const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const GEMINI_PROVIDER = "gemini";

export interface SecretManagerOptions {
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
}

export interface SetSecretInput {
  readonly profileName: string;
  readonly providerName: string;
  readonly apiKey: string;
}

export interface ISecretManager {
  loadProfile(profileName: string): Promise<SecretProfile>;
  getInjectionEnv(profile: SecretProfile, providerName?: string): ProviderResolutionEnv;
  injectToProcessEnv(profile: SecretProfile, providerName?: string): void;
}

function toTrimmedNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new ConfigurationError(`CONFIGURATION_ERROR ${fieldName} must be non-empty`);
  }
  return trimmed;
}

function assertName(name: string, fieldName: string): string {
  const trimmed = toTrimmedNonEmpty(name, fieldName);
  if (!NAME_PATTERN.test(trimmed)) {
    throw new ConfigurationError(
      `CONFIGURATION_ERROR ${fieldName} must match pattern ^[a-zA-Z0-9_-]+$`
    );
  }
  return trimmed;
}

function assertRawName(name: string, fieldName: string): string {
  if (name === "") {
    throw new ConfigurationError(`CONFIGURATION_ERROR ${fieldName} must be non-empty`);
  }
  if (!NAME_PATTERN.test(name)) {
    throw new ConfigurationError(
      `CONFIGURATION_ERROR ${fieldName} must match pattern ^[a-zA-Z0-9_-]+$`
    );
  }
  return name;
}

function cloneStore(store: SecretStore): Record<string, { providers: Record<string, SecretProviderEntry> }> {
  const out: Record<string, { providers: Record<string, SecretProviderEntry> }> = {};
  for (const [profileName, profile] of Object.entries(store)) {
    out[profileName] = {
      providers: { ...profile.providers },
    };
  }
  return out;
}

function normalizeProviderHint(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value === "" ? undefined : value;
}

export class FileSecretManager implements ISecretManager {
  private readonly options: SecretManagerOptions;

  constructor(options: SecretManagerOptions = {}) {
    this.options = options;
  }

  getSecretsFilePath(): string {
    return resolveSecretsFilePath({
      platform: this.options.platform,
      env: this.options.env,
    });
  }

  async loadProfile(profileName: string): Promise<SecretProfile> {
    const normalizedProfile = assertName(profileName, "profile");
    const store = await this.readSecretStore({ allowMissing: false });
    const profile = store[normalizedProfile];
    if (!profile) {
      const available = Object.keys(store).sort();
      const suffix =
        available.length > 0
          ? ` available profiles: ${available.join(", ")}`
          : " no profiles are configured.";
      throw new ConfigurationError(
        `CONFIGURATION_ERROR secret profile '${normalizedProfile}' was not found in ${this.getSecretsFilePath()}.${suffix}`
      );
    }
    return profile;
  }

  getInjectionEnv(profile: SecretProfile, providerName?: string): ProviderResolutionEnv {
    const normalizedHint = normalizeProviderHint(providerName);

    if (normalizedHint === GEMINI_PROVIDER) {
      const gemini = profile.providers[GEMINI_PROVIDER];
      if (!gemini) {
        throw new ConfigurationError(
          "CONFIGURATION_ERROR profile is missing provider='gemini' secret required for provider resolution"
        );
      }
      return {
        GEMINI_API_KEY: toTrimmedNonEmpty(gemini.apiKey, "apiKey"),
      };
    }

    if (!normalizedHint) {
      const gemini = profile.providers[GEMINI_PROVIDER];
      if (gemini && gemini.apiKey.trim() !== "") {
        return {
          GEMINI_API_KEY: gemini.apiKey,
        };
      }
    }

    return {};
  }

  injectToProcessEnv(profile: SecretProfile, providerName?: string): void {
    const injectionEnv = this.getInjectionEnv(profile, providerName);
    for (const [key, value] of Object.entries(injectionEnv)) {
      if (typeof value === "string") {
        process.env[key] = value;
      }
    }
  }

  async setSecret(input: SetSecretInput): Promise<void> {
    const profileName = assertName(input.profileName, "profile");
    const providerName = canonicalizeProviderForStorage(
      assertRawName(input.providerName, "provider")
    );
    const apiKey = toTrimmedNonEmpty(input.apiKey, "apiKey");

    const existing = await this.readSecretStore({ allowMissing: true });
    const nextStore = cloneStore(existing);
    const profile = nextStore[profileName] ?? { providers: {} };
    profile.providers[providerName] = {
      apiKey,
    };
    nextStore[profileName] = profile;

    await writeFileAtomically(this.getSecretsFilePath(), `${JSON.stringify(nextStore, null, 2)}\n`);
  }

  private async readSecretStore(options: { readonly allowMissing: boolean }): Promise<SecretStore> {
    const targetPath = this.getSecretsFilePath();
    let serialized: string;
    try {
      serialized = await fs.readFile(targetPath, "utf8");
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT" && options.allowMissing) {
        return {};
      }
      if (nodeError?.code === "ENOENT") {
        throw new ConfigurationError(
          `CONFIGURATION_ERROR secrets file not found at ${targetPath}. ${SECRET_SET_GUIDE}`
        );
      }
      throw new ConfigurationError(
        `CONFIGURATION_ERROR failed to read secrets file at ${targetPath}`,
        { cause: error }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch (error) {
      throw new ConfigurationError(
        `CONFIGURATION_ERROR failed to parse secrets file at ${targetPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return validateSecretStore(parsed);
  }
}

export function getSecretSetGuide(): string {
  return SECRET_SET_GUIDE;
}
