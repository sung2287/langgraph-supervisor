export const WEB_SESSION_PREFIX = "web.";
const SESSION_FILENAME_PATTERN = /^session_state\.([A-Za-z0-9._-]+)\.json$/;

export function sanitizeSessionName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new Error("SESSION_NAMESPACE_INVALID session name must be non-empty");
  }
  return trimmed.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function buildSessionFilename(sessionName?: string): string {
  if (typeof sessionName !== "string" || sessionName.trim() === "") {
    return "session_state.json";
  }
  return `session_state.${sanitizeSessionName(sessionName)}.json`;
}

export function buildWebSessionId(name: string): string {
  const sanitized = sanitizeSessionName(name);
  if (sanitized.startsWith(WEB_SESSION_PREFIX)) {
    return sanitized;
  }
  return `${WEB_SESSION_PREFIX}${sanitized}`;
}

export function buildWebSessionFilename(sessionIdOrName: string): string {
  const webSessionId = buildWebSessionId(sessionIdOrName);
  return buildSessionFilename(webSessionId);
}

export function toAuthorizedWebSessionId(raw: string): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const canonical = buildWebSessionId(trimmed);
  if (canonical !== trimmed) {
    return null;
  }
  return canonical;
}

export function parseSessionIdFromFilename(filename: string): string | null {
  const matched = SESSION_FILENAME_PATTERN.exec(filename);
  if (!matched) {
    return null;
  }
  return matched[1] ?? null;
}

export function parseAuthorizedWebSessionIdFromFilename(filename: string): string | null {
  const sessionId = parseSessionIdFromFilename(filename);
  if (!sessionId) {
    return null;
  }
  return toAuthorizedWebSessionId(sessionId);
}
