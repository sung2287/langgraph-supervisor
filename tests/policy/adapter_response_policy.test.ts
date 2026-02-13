/**
 * Intent: PRD-006 런타임 정책 집행 (구현 강제)
 * 1) Core Domain Entity(클래스 인스턴스 등) 외부 유출 금지
 * 2) PRD-004 PublicMessage=N 마스킹 강제
 *
 * 이 파일은 "정책 테스트"이며, 기능 테스트가 아니다.
 */

import test from "node:test";
import assert from "node:assert/strict";

// 코딩 에이전트가 구현해야 하는 모듈(계약):
const MODULE_PATH = "../../src/adapter/_shared/response_policy";

test("PRD-006: response_policy module must exist and export required functions", async () => {
  const mod = (await import(MODULE_PATH)) as any;
  assert.equal(typeof mod.assertNoDomainEntityLeak, "function");
  assert.equal(typeof mod.mapCoreErrorToExternal, "function");
});

test("PRD-006: response must not contain class instances (domain entity leak)", async () => {
  const mod = (await import(MODULE_PATH)) as any;

  class FakeEntity {
    constructor(public id: string) {}
    method() {
      return "x";
    }
  }

  const response = { ok: true, data: { entity: new FakeEntity("1") } };

  assert.throws(() => mod.assertNoDomainEntityLeak(response), /VIOLATION|Entity|leak/i);
});

test("PRD-004/006: PublicMessage=N must be masked", async () => {
  const mod = (await import(MODULE_PATH)) as any;

  const external = mod.mapCoreErrorToExternal({
    code: "E_CORE_INVARIANT_BROKEN",
    message: "Sensitive internal details",
  });

  assert.equal(external.ok, false);
  assert.equal(external.error.code, "E_CORE_INVARIANT_BROKEN");
  assert.equal(external.error.message, "Internal Server Error");
});
