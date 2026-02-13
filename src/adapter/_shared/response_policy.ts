import type { CoreErrorShape } from "../../core/errors/canonical_error_codes";
import { ERROR_POLICY_REGISTRY } from "./error_policy_registry";

export function assertNoDomainEntityLeak(value: unknown): void {
  const seen = new Set<unknown>();

  const visit = (current: unknown): void => {
    if (current == null) return;

    const t = typeof current;
    if (t === "string" || t === "number" || t === "boolean" || t === "undefined") {
      return;
    }

    if (t === "function" || t === "symbol" || t === "bigint") {
      throw new Error("PRD-006 VIOLATION: domain Entity leak detected");
    }

    if (t !== "object") {
      throw new Error("PRD-006 VIOLATION: unsupported value leak");
    }

    if (seen.has(current)) return;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }

    const proto = Object.getPrototypeOf(current);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error("PRD-006 VIOLATION: domain Entity leak detected");
    }

    for (const key of Object.keys(current as Record<string, unknown>)) {
      visit((current as Record<string, unknown>)[key]);
    }
  };

  visit(value);
}

export function mapCoreErrorToExternal(err: Pick<CoreErrorShape, "code" | "message">): {
  ok: false;
  error: { code: string; message: string };
} {
  const policy = ERROR_POLICY_REGISTRY[err.code];
  return {
    ok: false,
    error: {
      code: err.code,
      message: policy.publicMessage === "Y" ? err.message : "Internal Server Error",
    },
  };
}
