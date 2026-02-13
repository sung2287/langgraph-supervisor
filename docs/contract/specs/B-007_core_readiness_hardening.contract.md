# B-007: Core Readiness Hardening (Contract)

## 1. 개요 (Overview)
본 Contract는 `PRD-007` 하드닝 원칙에 따라 Core의 구조적 결함 가능성을 원천 차단하고, `PRD-008` 및 `PRD-009`에서 정의된 봉인 상태가 레이어 전반에서 유지되도록 강제하는 가버넌스 규약이다.

## 2. 경계 불변성 규칙 (Boundary Invariants)

### 2.1 가드 호출 강제 (Guard Enforcement)
- 모든 Core Service 진입점은 비즈니스 로직 수행 전 반드시 입력 DTO의 유효성 및 `undefined` 존재 여부를 검증하는 가드(Guard)를 호출해야 한다. (B-007-2.1)
- 가드 호출이 누락된 서비스는 하드닝 계약 위반으로 간주한다.

### 2.2 결정론적 로직 보장 (Deterministic Logic)
- Core 내부 로직은 비결정적 외부 API(시간, 랜덤 등)에 직접 의존할 수 없다. (B-007-2.2)
- 반드시 추상화된 인터페이스를 주입받아 사용하며, 이를 통해 테스트 결정론과 로직 재현성을 보장해야 한다.

## 3. 리포지토리 순수성 (Repository Purity)
- Repository 인터페이스 및 구현체는 도메인 엔티티(Entity)를 반환할 수 없다. (B-007-3.0)
- 오직 순수 데이터 DTO만을 반환하여 Persistence 계층의 변경이 Core 비즈니스 로직에 영향을 주지 않도록 격리한다.

## 4. 어댑터 변환 책임 (Adapter Layer Responsibility)

### 4.1 Result 패턴 격리
- Core는 성공 시 데이터를 반환하고 실패 시 `CoreError`를 throw한다. (B-007-4.1)
- `{ ok: boolean }` 형태의 Result 패턴은 오직 Adapter 레이어에서만 존재하며, 이를 변환하는 책임은 Adapter의 SSOT(Single Source of Truth) 로직에 있다.

### 4.2 알 수 없는 에러 래핑 (Unknown Error Wrapping)
- Core에서 발생하지 않은 비정형 예외(Non-CoreError)는 Adapter 진입점에서 반드시 포착되어야 한다. (B-007-4.2)
- 해당 예외는 Adapter에서 정의한 "Internal System Error" 정책에 따라 적절한 에러 코드로 래핑되어야 한다.
- Core는 시스템 레벨의 내부 에러 코드를 정의하거나 이에 의존하지 않는다.

## 5. Snapshot Invariant (Reference Isolation)

Core는 내부 상태 보호를 위해 참조 격리를 보장해야 한다. (B-007-5.0)

- **Snapshot 필수:** Core가 외부로 반환하는 모든 출력(Output)은 반드시 독립적인 스냅샷(Snapshot)이어야 한다.
- **참조 노출 금지:** Core는 내부 상태 객체 또는 엔티티의 참조를 외부로 직접 노출해서는 안 된다.
- **참조 공유 차단:** 반환된 DTO를 외부(Adapter 등)에서 수정하더라도 Core 내부의 데이터 상태에 어떠한 영향도 주지 않아야 한다.
- **계약 위반:** 스냅샷 불변성을 위반하여 내부 상태가 변조되는 현상이 발견될 경우, 이는 즉각적인 HOLD 사유가 된다.

## 6. 금지 패턴 (Forbidden Patterns)

- **Raw Error 생성 및 Throw 금지:** Core 내에서 `new Error()`, `throw "string"`, `throw new Error(...)` 등 비정형 예외 처리를 금지한다. 오직 `throw CoreError(...)` 또는 그에 준하는 규격화된 타입만 허용한다.
- **비결정적 API 직접 호출 금지:** Core 내부에서 `new Date()`, `Date.now()`, `Math.random()` 등을 직접 호출하는 행위를 금지한다.
- **Core 내 Result 사용 금지:** Core 서비스나 유틸리티에서 성공 여부를 객체로 반환하는 행위를 금지한다.

## 7. HOLD 조건 (HOLD Conditions)

다음 조건 중 하나라도 충족될 경우, 해당 변경 사항은 승인이 거부(HOLD)된다.

1. **Result 반환:** Core 서비스가 데이터 대신 Result 타입이나 `ok` 프로퍼티를 가진 객체를 반환하는 경우.
2. **Raw Error 사용:** Core 내부에서 Raw Error를 생성하거나 throw 하는 경우.
3. **결정론 위반:** Core 내부에서 `Date` 또는 `Math.random`을 직접 사용하는 경우.
4. **Snapshot 위반:** 반환된 DTO 수정 시 Core 내부 상태가 변조되는 부수 효과(Snapshot Violation)가 발견되는 경우.
5. **SSOT 결함:** Adapter 레이어에서 Core 호출 결과를 변환하는 단일 접점(SSOT) 함수가 부재한 경우.
6. **래핑 누락:** Adapter 경계에서 Unknown Error에 대한 "Internal System Error" 래핑 처리가 누락된 경우.
