# B-009: Core I/O Immutability (Contract)

## 1. 개요 (Overview)
본 Contract는 `PRD-009: Core I/O Immutability`에 기반하여, Core 계층의 입력(Input) 및 출력(Output) 데이터를 불변(Immutable) 상태로 고정하고, 데이터 오염 및 부수 효과(Side-effect)를 원천 차단하기 위한 규약이다.

## 2. 입력 불변 규칙 (Immutable Input Rules)

Core 계층으로 유입되는 모든 데이터는 다음 규칙을 준수해야 한다.

### 2.1 Plain DTO Only
- 모든 입력 데이터는 순수 객체(Plain Object)여야 한다.
- **금지 사항:** `class` 인스턴스 전달, `prototype` 확장 객체 전달, 내부 로직(Method)이 포함된 객체 전달.

### 2.2 undefined 사용 금지
- Core 입력 DTO 내부의 모든 필드는 `undefined`를 허용하지 않는다.
- 데이터의 부재는 명시적으로 `null`을 사용하거나, TypeScript의 선택적 필드(`?`)를 통해 정의하되 실제 값으로 `undefined`가 할당되어 전달되는 것을 금지한다.

### 2.3 Timestamp 생성 책임 (Core-Only)
- `created_at`, `updated_at` 등의 시간 데이터는 Core 내부에서만 생성한다.
- 외부(Adapter 등)에서 전달된 시간 데이터는 비즈니스 로직의 기준 시간으로 신뢰하지 않는다.

## 3. 출력 불변 규칙 (Immutable Output Rules)

Core 계층에서 반환되는 모든 데이터는 다음 규칙을 준수해야 한다.

### 3.1 Snapshot Guarantee
- Core는 내부 상태 객체의 참조(Reference)를 직접 반환하지 않는다.
- 반환되는 데이터는 반드시 독립적인 스냅샷(Snapshot)이어야 하며, 다음 중 하나의 방식을 강제한다:
    1. **Deep Copy:** 반환 직전 객체를 깊은 복사하여 반환.
    2. **Structural Immutability:** 생성 시점부터 불변 구조로 설계된 객체 반환.

### 3.2 참조 공유 금지 (No Reference Sharing)
- Adapter 계층에서 반환된 객체를 수정하더라도 Core 내부의 데이터 상태에 어떠한 영향도 주지 않음을 보장해야 한다.

### 3.3 null 명시 정책
- 데이터의 부재를 표현할 때는 `null`을 사용하며, 반환값에 `undefined`를 포함하지 않는다.

## 4. 에러 정책 정합성 (Error Policy Alignment)

본 Contract는 `PRD-008 (Canonical Error System)`을 엄격히 준수한다.

### 4.1 Canonical CoreError Only
- Core는 반드시 `PRD-008`에서 정의된 `ErrorCode`를 포함한 `CoreError` 구조만을 throw한다.
- `E_CORE_*` 및 `E_CONTRACT_MISMATCH` 코드만 생성 가능하다.

### 4.2 Result Pattern 금지
- Core Service는 성공 시 데이터를 반환하고 실패 시 throw한다.
- `{ ok: boolean, data?: T, error?: E }` 와 같은 Result 객체 반환은 금지한다 (Adapter 계층의 책임).

### 4.3 Metadata 격리
- Core는 에러 정책 메타데이터(HTTP Status, CLI Exit Code 등)에 접근하거나 이를 정의에 포함할 수 없다.

## 5. Repository 계약 고정 (Persistence Freeze)

- Repository는 Domain Entity(내부 복잡 로직 포함 객체)를 반환하지 않는다.
- Repository 인터페이스는 오직 순수 데이터 구조(Pure Data DTO)만을 반환하도록 정의한다.

## 6. Drift 방지 및 고정 (Freeze)

### 6.1 Drift 정의
- Core 입력값으로 `class` 인스턴스나 `undefined`가 전달되는 경우.
- Core 반환값의 참조를 수정했을 때 Core 내부 상태가 변경되는 경우.
- Core 외부에서 생성된 Timestamp가 Core의 저장 로직에 직접 사용되는 경우.

### 6.2 Drift HOLD 조건
- **빌드 및 테스트 중단:** 입력값 유효성 검사 또는 출력값 불변성 테스트 실패 시 즉시 중단.
- **LOCKED:** 본 문서는 PRD-009 종료와 동시에 LOCKED 상태로 전환되며, 이후의 변경은 엄격한 영향도 평가를 거쳐야 한다.
