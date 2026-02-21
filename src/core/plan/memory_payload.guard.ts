const FORBIDDEN_MEMORY_KEYS = new Set(["summary", "keywords", "memories"]);

function hasForbiddenMemoryKeyInternal(
  value: unknown,
  seen: Set<unknown>
): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenMemoryKeyInternal(item, seen));
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_MEMORY_KEYS.has(key.toLowerCase())) {
      return true;
    }
    if (hasForbiddenMemoryKeyInternal(child, seen)) {
      return true;
    }
  }

  return false;
}

export function hasForbiddenMemoryPayloadKeys(value: unknown): boolean {
  return hasForbiddenMemoryKeyInternal(value, new Set<unknown>());
}
