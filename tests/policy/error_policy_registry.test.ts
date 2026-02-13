import test from "node:test";
import assert from "node:assert/strict";
import { ERROR_CODES } from "../../src/core/errors/canonical_error_codes";
import { ERROR_POLICY_REGISTRY } from "../../src/adapter/_shared/error_policy_registry";

test("PRD-008: error policy registry must be exhaustive for canonical error codes", () => {
  const canonicalCodes = Object.values(ERROR_CODES).sort();
  const registryCodes = Object.keys(ERROR_POLICY_REGISTRY).sort();

  assert.deepEqual(registryCodes, canonicalCodes);
});
