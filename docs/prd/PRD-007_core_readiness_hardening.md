# PRD-007: Core Readiness Hardening (Revalidated under PRD-009)

## PRD Type
- FUNCTIONAL (Hardening / Franchise Mainline Stabilization)

---

## 1. Meta

- prd: PRD-007
- action: core_readiness_hardening
- owner: human
- reviewer: Senior Reviewer (Governor)
- status: DRAFT (Revalidated after PRD-009)
- depends_on:
  - PRD-001~003 (TOC CRUD Core)
  - PRD-005 (Core Error Model)
  - PRD-006 (Adapter Boundary)
  - PRD-008 (Canonical Error Contract)
  - PRD-009 (Core I/O Immutability)

---

## 2. One-liner

> PRD-009로 봉인된 Core I/O 불변 계약을 전역에 확산하고, Adapter 이후 구조를 기준으로 Core를 "프랜차이즈 본점" 수준으로 하드닝한다.

---

## 3. 위치 재정의 (After PRD-009)

PRD-009는 Core 입출력 계약을 불변 조건으로 봉인하였다.

따라서 PRD-007은 기능 확장이 아니라:

- 봉인된 I/O 계약을 Core 전역에 일관되게 확산하고
- Error / Boundary / Snapshot / Guard 패턴을 구조적으로 재점검하며
- Adapter 이후 경계 구조에서 의미 누수 가능성을 제거하는

**재검증 + 구조 하드닝 PRD**로 정의한다.

---

## 4. 비목표 (Non-Goals)

다음은 본 PRD의 범위에 포함되지 않는다:

- 새로운 기능 추가
- DB / ORM 도입
- Lock 메커니즘 구현
- Logger 구현체 도입
- HTTP/CLI 응답 구조 변경
- Result 패턴을 Core에 도입하는 행위 (금지)

---

## 5. 절대 고정 정책 (A안 불변 원칙)

다음 정책은 PRD-009 및 B-009 Contract와 정합되어야 한다.

### 5.1 성공 / 실패 모델

- Core는 성공 시 **data를 return**한다.
- 실패 시 반드시 **throw CoreError** 한다.
- `{ ok, data, error }` 형태의 Result 반환은 Core에서 금지한다.
- Raw Error, string throw, unknown throw 금지.

### 5.2 메타데이터 격리

- Core는 HTTP status, CLI exit code, retryable 여부를 알지 못한다.
- 정책 메타데이터는 Adapter 계층의 책임이다.

---

## 6. 하드닝 범위 (Scope)

PRD-007은 다음 네 영역을 재검증한다.

### H1. Core Service 경계 일관성 재점검

- 모든 Core Service 진입점에서:
  - 입력 Guard 호출 여부 확인
  - undefined 차단 여부 확인
  - TimeProvider 사용 여부 확인
- Date / Random 직접 호출 전수 검사
- Core 내부에서 Result 타입 사용 흔적 제거

### H2. Snapshot / 참조 격리 재확인

- 모든 반환 DTO는 Snapshot 보장
- 참조 공유 가능성 제거
- Mutation Test 보강
- Deep copy 또는 구조적 불변 전략 일관성 확보

이 항목은 PRD-009의 Output 규칙을 전역 확산하는 작업이다.

### H3. Repository Purity 재확인

- Repository는 순수 데이터만 반환
- Domain Entity 반환 금지
- Service 레이어에서 배열 전체 탐색 기반 로직 존재 여부 점검
- Persistence 확장 가능성을 고려한 계약 정합성 점검

### H4. Adapter 외곽 Result 변환 단일화

- Core 호출부에 try/catch 존재 여부 점검
- CoreError → Result 변환 함수 SSOT(Single Source of Truth) 보장
- Core 내부에 Result 타입이 스며들지 않았는지 확인

---

## 7. 테스트 하드닝 (Test Reinforcement)

본 PRD는 테스트를 통해 의미를 고정한다.

테스트 철학은 테스트 코드 활용 로드맵의 통제 원칙을 따른다.

### 7.1 필수 테스트 항목

- Core 서비스별:
  - 입력 변조 테스트
  - undefined 차단 테스트
  - Snapshot 변조 테스트
  - CoreError 코드 일치 테스트 (PRD-008 정합)

### 7.2 Drift 차단

- Intent Summary가 없는 테스트 파일 HOLD
- Core 레이어에서 금지 API(Date, Random 등) 사용 시 HOLD
- 참조 공유 탐지 시 HOLD

---

## 8. 승인 조건 (Done Definition)

다음 조건이 모두 충족되어야 PRD-007은 종료된다.

1. Core 전 영역 typecheck PASS
2. Core 전 영역 test PASS
3. Core 내부에 Result 반환 흔적 없음
4. Core 내부에 raw Error 없음
5. Date / Random 직접 호출 없음
6. Adapter 경계에서 Result 변환 SSOT 존재
7. Reviewer 판정 기록 존재 (APPROVED / HOLD / REJECTED)
8. `prd:close` 성공 및 state:promote PASS

본 사이클은 기능 PRD이므로 일반 Sandbox → Core 승격 사이클을 따른다.

---

## 9. 구조적 목표 (Franchise Mainline Stabilization)

PRD-007의 구조적 목적은 다음과 같다.

- Core를 "확장 가능한 본점"으로 고정한다.
- Adapter, 환경, 외곽 정책이 변경되어도 Core 의미는 흔들리지 않는다.
- PRD-010 (최소 테스트 존재 규칙) 이전에 Core를 구조적으로 봉인한다.

현재 PRD-007은 MAIN 라인에서 진행 중인 재검증 PRD이다.

---

## 10. 한 줄 결론

PRD-009가 Core의 입출력 계약을 봉인했다면,

PRD-007은 그 계약이 **우연이 아니라 구조적으로 강제되고 있는지**를 증명하는 재검증 단계다.

