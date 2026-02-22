import { ConfigurationError } from "../llm/errors";

export interface SecretProviderEntry {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly organization?: string;
}

export interface SecretProfile {
  readonly providers: Readonly<Record<string, SecretProviderEntry>>;
}

export type SecretStore = Readonly<Record<string, SecretProfile>>;

const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

function ensureObject(value: unknown, errorMessage: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigurationError(errorMessage);
  }
  return value as Record<string, unknown>;
}

function ensureOptionalString(
  value: unknown,
  fieldName: string,
  profileName: string,
  providerName: string
): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ConfigurationError(
      `CONFIGURATION_ERROR invalid '${fieldName}' for profile='${profileName}' provider='${providerName}'`
    );
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new ConfigurationError(
      `CONFIGURATION_ERROR '${fieldName}' must be non-empty for profile='${profileName}' provider='${providerName}'`
    );
  }
  return trimmed;
}

function validateProviderEntry(
  value: unknown,
  profileName: string,
  providerName: string
): SecretProviderEntry {
  const row = ensureObject(
    value,
    `CONFIGURATION_ERROR invalid provider entry for profile='${profileName}' provider='${providerName}'`
  );
  const apiKey = ensureOptionalString(row.apiKey, "apiKey", profileName, providerName);
  if (!apiKey) {
    throw new ConfigurationError(
      `CONFIGURATION_ERROR apiKey is required for profile='${profileName}' provider='${providerName}'`
    );
  }

  return {
    apiKey,
    baseUrl: ensureOptionalString(row.baseUrl, "baseUrl", profileName, providerName),
    organization: ensureOptionalString(
      row.organization,
      "organization",
      profileName,
      providerName
    ),
  };
}

function validateProfile(profileName: string, value: unknown): SecretProfile {
  if (!NAME_PATTERN.test(profileName)) {
    throw new ConfigurationError(
      `CONFIGURATION_ERROR invalid profile name '${profileName}'. expected pattern: ^[a-zA-Z0-9_-]+$`
    );
  }

  const row = ensureObject(value, `CONFIGURATION_ERROR invalid profile object '${profileName}'`);
  const providersRow = ensureObject(
    row.providers,
    `CONFIGURATION_ERROR profile '${profileName}' must include providers`
  );

  const providers: Record<string, SecretProviderEntry> = {};
  for (const [providerName, providerValue] of Object.entries(providersRow)) {
    if (!NAME_PATTERN.test(providerName)) {
      throw new ConfigurationError(
        `CONFIGURATION_ERROR invalid provider name '${providerName}' in profile='${profileName}'`
      );
    }
    providers[providerName] = validateProviderEntry(providerValue, profileName, providerName);
  }

  return {
    providers,
  };
}

export function validateSecretStore(value: unknown): SecretStore {
  const root = ensureObject(
    value,
    "CONFIGURATION_ERROR secrets.json must be an object keyed by profile name"
  );

  const out: Record<string, SecretProfile> = {};
  for (const [profileName, profileValue] of Object.entries(root)) {
    out[profileName] = validateProfile(profileName, profileValue);
  }
  return out;
}
