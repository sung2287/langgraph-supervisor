# PRD-008: Canonical Error System Freeze

## PRD Type
- GOVERNANCE (Cross-Layer Canonicalization)

---

## 1. 목적 (Purpose)

본 PRD의 목적은 **Core Error Policy(PRD-004)** 와  
**Adapter Error Mapping(PRD-006)** 을 하나의 **Canonical Error System** 으로 통합하고,  
해당 체계를 이후 임의로 변경할 수 없도록 기준선(Baseline)으로 고정하는 것이다.

이 PRD는:
- 새로운 에러를 추가하지 않는다.
- 기존 비즈니스 기능을 변경하지 않는다.
- 구조를 수정하지 않는다.

본 PRD는 단지 다음을 수행한다:

> 에러 체계를 단일 계약 체계로 봉인(seal)한다.

---

## 2. 문제 정의 (Problem Statement)

현재 시스템은 다음과 같이 분리되어 있다:

- PRD-004: Core 내부의 Error 생성 계약
- PRD-006: Adapter의 Error 변환 및 외부 매핑 계약

그러나 이 둘은 문서적으로 연결되어 있을 뿐,
**단일 Canonical Error System으로 선언되어 있지 않다.**

이 상태는 다음 리스크를 가진다:

1. ErrorCode 추가 시 Core와 Adapter 간 Drift 가능성
2. Adapter Mapping 수정 시 Core Contract와 불일치 가능성
3. Fallback Error의 책임 위치 모호성
4. 테스트/정적 분석 규칙과 매핑 테이블 간 동기화 누락 위험

본 PRD는 이 구조적 공백을 제거한다.

---

## 3. Canonical Error System 정의

Canonical Error System은 다음 세 요소로 구성된다.

---

### 3.1 Closed ErrorCode Set (닫힌 집합 선언)

ErrorCode는 닫힌 집합(Closed Set)으로 정의된다.

#### 3.1.1 Core Error Codes

Core에서 생성 가능한 ErrorCode는 다음으로 제한된다.

- E_CORE_INVALID_INPUT
- E_CORE_STATE_VIOLATION
- E_CORE_INVARIANT_BROKEN
- E_CONTRACT_MISMATCH

#### 3.1.2 Adapter Error Codes

- E_ADAPTER_VALIDATION

#### 3.1.3 System Fallback Error (공통 계층)

- E_INTERNAL_ERROR

`E_INTERNAL_ERROR`는 특정 레이어 전용 코드가 아니다.

이는 다음 상황을 포괄하는 **System-Wide Fallback Error**이다:

- 정의되지 않은 예외
- 예상치 못한 런타임 오류
- Core/Adapter 어디에서도 명시적으로 처리되지 않은 예외

새로운 ErrorCode 추가는 반드시 **신규 PRD**를 통해서만 가능하다.

---

### 3.2 Error Policy Metadata 고정

각 ErrorCode는 다음 정책 메타데이터를 가진다.

- PublicMessage (Y/N)
- HTTP Status
- CLI Exit Code
- Retryable 여부

정책 메타데이터는 Adapter 레이어에서만 해석된다.

### 중요 원칙

- Core는 정책 메타데이터를 **수정하거나 해석하지 않는다.**
- Core는 오직 `code`를 통해 의미적 실패를 표현한다.
- Retryable 판단은 인프라/전송 계층 책임이다.

관심사 분리는 유지되어야 한다.

---

### 3.3 CoreError Shape 유지

Core에서 throw 되는 모든 에러는 다음 구조를 유지해야 한다.

```ts
interface CoreError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}
```

제약 사항:

- message 기반 테스트 금지
- stack trace 의존 금지
- 비결정성 값 포함 금지
- code 변조 금지

---

## 4. Drift 방지 규칙 (Drift Prevention Rules)

Drift는 컴파일 타임 또는 테스트 단계에서 감지되어야 한다.

### 4.1 타입 기반 강제 규칙

- ErrorCode는 `as const` 객체 또는 `enum`으로 정의된다.
- Core와 Adapter는 동일 타입을 import 한다.
- Adapter의 매핑 테이블은 **exhaustive check**를 통해 모든 ErrorCode를 처리해야 한다.
- 누락 시 TypeScript 컴파일 에러가 발생해야 한다.

### 4.2 자동 HOLD 조건

다음 경우 자동 HOLD 사유로 간주한다.

1. Core ErrorCode 목록과 Adapter 매핑 테이블 불일치
2. 새로운 ErrorCode가 Core에 추가되었으나 Adapter 매핑 미정의
3. Adapter 매핑 테이블에 존재하나 Core Contract에 정의되지 않은 코드 존재
4. ErrorCode 문자열 변경

이 검증은 정적 분석 + 타입 시스템 + CI 단계에서 수행되어야 한다.

---

## 5. 변경 절차 (Change Procedure)

Error 체계를 수정하려면 반드시 다음 절차를 따른다.

1. 신규 PRD 작성
2. Contract(B) 수정
3. Intent(C) 수정
4. Platform(D) Enforcement 수정
5. Reviewer 승인
6. Human 승인

직접 수정은 금지된다.

긴급 상황이라 하더라도 본 절차는 생략할 수 없다.

---

## 6. 범위 (Scope)

### 포함
- PRD-004 Error Contract 재확인
- PRD-006 Error Mapping 재확인
- Cross-layer 정합성 규칙 명문화
- 타입 기반 Drift 방지 규칙 명문화

### 제외
- 신규 ErrorCode 정의
- Error 구조 변경
- Adapter 로직 변경
- 테스트 전략 변경

---

## 7. 성공 기준 (Acceptance Criteria)

본 PRD는 다음 조건을 모두 만족할 때 완료로 판정된다.

1. ErrorCode 집합이 명시적으로 닫힌 집합으로 선언됨
2. Core와 Adapter의 Error 체계가 단일 Canonical System으로 문서화됨
3. 타입 시스템 기반 Drift 감지 규칙이 정의됨
4. Fallback Error의 위치가 명확히 정의됨
5. Reviewer가 Cross-Layer 정합성을 확인하고 APPROVED 판정

---

## 8. 한 줄 요약

> PRD-008은 에러를 더 이상 레이어별 계약으로 두지 않고,
> 시스템 전체의 단일 기준선으로 봉인한다.
> Drift는 컴파일 타임에 차단된다.

