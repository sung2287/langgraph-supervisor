function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unsupportedTypeLabel(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "function") {
    return "function";
  }
  if (typeof value === "bigint") {
    return "bigint";
  }
  if (typeof value === "symbol") {
    return "symbol";
  }
  return typeof value;
}

function assertSupported(value: unknown): void {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    throw new Error(
      `VALIDATION_ERROR stableStringify does not support type=${unsupportedTypeLabel(value)}`
    );
  }
}

function normalize(value: unknown): unknown {
  assertSupported(value);

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }

  if (!isPlainObject(value)) {
    throw new Error("VALIDATION_ERROR stableStringify only supports plain objects");
  }

  const out: Record<string, unknown> = {};
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    out[key] = normalize(value[key]);
  }
  return out;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}
