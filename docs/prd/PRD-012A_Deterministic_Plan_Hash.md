# PRD-012A: Deterministic Plan Hash & Domain-Aware Hash

## 1. 배경 및 목적 (Background)
현재 런타임의 `computeExecutionPlanHash`는 `JSON.stringify`를 직접 사용하여 객체 키 순서에 따른 비결정성(Non-determinism) 위험을 안고 있다. 또한 `currentDomain`이 해시 계산에서 누락되어 도메인 간 세션 보호가 취약하다. 본 PRD는 PRD-012(Override UX)의 안전한 도입을 위해 세션 무결성 검증 로직을 결정론적이고 도메인 인지적인 구조로 안정화하는 것을 목적으로 한다.

## 2. 목표 (Goal)
- **Deterministic Hashing**: 어떤 환경에서도 동일 입력에 대해 100% 동일한 해시 보장.
- **Domain-Awareness**: 실행 도메인이 변경되면 해시가 즉시 변경되어 세션 오염 차단.
- **Metadata Standardization**: `provider`, `model`, `mode`, `domain`을 해시 입력의 필수 메타데이터로 고정.

## 3. 설계 요구사항 (Requirements)

### 3.1 Deterministic Serialization
- `JSON.stringify` 직접 사용 금지.
- Stable stringify 또는 키 정렬 기반 직렬화 사용.
- 입력 객체의 모든 key는 사전순(Alphabetical)으로 정렬되어야 한다.
- `timestamp`, `random` 값 등 가변 필드 포함 금지.

### 3.2 Hash Metadata 확장
현재: `hash(ExecutionPlan + PolicyRef)`
변경: `hash(executionPlan, policyRef, metadata: { provider, model, mode, domain })`

### 3.3 Metadata 구성 규칙
ExecutionContextMetadata는 반드시 다음 필드만 포함한다:
- `provider`
- `model`
- `mode`
- `domain`
- **금지**: `apiKey`, `secretProfile`, `timestamp`, `random`, `sessionId` 등 세션 상태 값.

### 3.4 Domain-Aware Hash
- `currentDomain`이 변경되면 해시는 반드시 달라져야 한다.
- domain unset 상태는 명시적으로 `"global"` 또는 `""`로 고정하여 포함한다.
- Domain 값은 암묵적으로 생략하지 않는다.

### 3.5 Structural Immutability
- `ExecutionPlan` 구조는 변경하지 않는다.
- `ExecutionPlan.extensions`는 계속 `[]`를 유지한다.
- Hash 입력 객체는 Orchestrator 레벨에서 구성한다.
- **Core-Zero-Mod**: `src/core` 수정 금지.

## 4. 실패 정의 (Failure Semantics)
- HashMismatch는 기존과 동일하게 Fail-Fast를 유지한다.
- `SESSION_STATE_HASH_MISMATCH` 메시지 변경 금지.
- Error 체계 리팩토링은 본 PRD 범위에 포함하지 않는다.

## 5. 테스트 요구사항 (Test Requirements)
- **Determinism Test**: 동일 입력 → 동일 해시 100회 반복 테스트. 객체 key 순서 변경 시에도 해시가 동일해야 함.
- **Sensitivity Test**: 도메인, 공급자(Provider), 모델 변경 시 해시가 반드시 달라져야 함을 검증.

## 6. 완료 정의 (Definition of Done)
1. Hash 계산이 완전 결정론적임이 테스트로 보장됨.
2. Domain 변경 시 해시 변경이 검증됨.
3. provider/model 변경 시 해시 변경이 검증됨.
4. `src/core` 내부 코드 수정 없음.
5. 기존 세션 복구 로직 정상 작동.

## 7. LOCK Summary
- Core-Zero-Mod 유지
- No Extensions Usage
- Deterministic Hash 강제
- Domain-Aware Hash 강제
- Secret Hash 포함 금지

---
**Design Rejection Required**: `src/core` 내부의 `verify` 함수 시그니처를 변경하거나, `ExecutionPlan` 인터페이스를 수정하려는 모든 시도는 규정 위반으로 간주됨.
