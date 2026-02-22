const MASKED_SECRET = "****";

export function redactSecretValue(value: string | undefined): string {
  if (typeof value !== "string" || value.trim() === "") {
    return MASKED_SECRET;
  }
  return MASKED_SECRET;
}
