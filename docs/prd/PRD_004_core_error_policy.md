# PRD-004_core_error_policy.md

## 1. 목적 (Purpose)

본 PRD의 목적은  
core 레이어에서 발생하는 **에러를 정책 자산으로 정의하고 고정**하는 것이다.

본 PRD는:
- 기능을 추가하지 않는다.
- 기존 성공 경로의 동작을 변경하지 않는다.
- 에러를 **의미(semantic) 단위**로 표준화한다.

본 PRD는  
테스트 기준 및 Contract 검증의 **공통 실패 규칙**으로 사용된다.

---

## 2. 범위 (Scope)

### 2.1 포함 범위

본 PRD는 다음 항목을 정의한다.

- 에러 분류 체계 (Error Code)
- 레이어별 에러 책임
- core 에러 구조(Shape)
- 실패 처리 기준
- 실패 케이스 테스트 기준

---

### 2.2 제외 범위 (명시적 비포함)

다음 항목은 본 PRD에 포함되지 않는다.

- UI 메시지 정책
- API 응답 포맷
- HTTP status code 매핑
- 로그 포맷 및 로깅 정책
- 성능 / 재시도 전략
- core 로직 변경

---

## 3. 동작 원칙 (Behavior Rules)

### 3.1 공통 에러 원칙

- 모든 에러는 **명시적인 타입(code)** 을 가진다.
- core는 에러를 **throw만** 한다.
- core 내부에서 catch 처리는 금지된다.
- 에러는 **의미만 포함**하며, 표현(format)은 레이어 책임이다.
- 비결정성 정보(Date, random, env)는 포함할 수 없다.
- 단, **상위 레이어에서 주입된 correlation_id / trace_id는 core 에러의 `details` 필드를 통해 전달될 수 있다.**

---

### 3.2 레이어별 책임 규칙

#### Core

- 허용:
  - 의미 있는 에러 생성 및 throw
- 금지:
  - try / catch
  - 로그 출력
  - IO / infra 정보 접근
  - 외부 라이브러리 에러 직접 노출

#### Sandbox

- core 에러 전달 가능
- 실행 환경 실패 시 sandbox 에러로 변환 가능

#### Adapter

- 외부 에러를 정책 에러로 변환
- 사용자 메시지 노출 여부 결정

---

## 4. 에러 분류 정책 (Error Policy Table)

| ErrorCode | 책임 레이어 | Retryable | PublicMessage | InternalDetail |
|---------|-------------|-----------|----------------|----------------|
| E_CORE_INVALID_INPUT | core | N | Y | Y |
| E_CORE_STATE_VIOLATION | core | N | N | Y |
| E_CORE_INVARIANT_BROKEN | core | N | N | Y |
| E_CONTRACT_MISMATCH | core | N | N | Y |
| E_SANDBOX_EXECUTION_FAILED | sandbox | Y | Y | Y |
| E_ADAPTER_EXTERNAL_FAILURE | adapter | Y | Y | Y |

**정책 제약**

- core는 `E_CORE_*` 계열만 생성할 수 있다.
- sandbox / adapter는 core 에러를 수정하지 않는다.
- **상위 레이어는 core 에러의 `code`를 변조할 수 없다.**

---

## 5. 에러 구조 (Error Shape)

### 5.1 Core Error Shape

```ts
interface CoreError {
  code: string;        // 정책 코드
  message: string;     // 의미 중심 메시지
  details?: Record<string, unknown>; // InternalDetail 수용 (trace_id 등)
  cause?: unknown;     // 내부 추적용 (선택)
}
```

- stack trace 의존 금지
- message는 UX 목적이 아니다
- message 문자열 비교 테스트 금지

---

## 6. 실패 처리 (Failure Semantics)

다음 경우 동작은 실패로 처리된다.

- 잘못된 입력
- 상태 불일치
- 계약(Contract) 위반
- core 불변식(invariant) 붕괴

실패 시:
- 시스템 상태는 변경되지 않는다.
- 부분 성공은 존재하지 않는다.
- 에러는 즉시 상위 레이어로 전파된다.

---

## 7. 테스트 기준 (Acceptance)

### 7.1 필수 테스트

- 모든 실패 테스트는 **message가 아닌 code 기반으로 검증**해야 한다.

- 잘못된 입력 → `E_CORE_INVALID_INPUT`
- 상태 위반 → `E_CORE_STATE_VIOLATION`
- 계약 불일치 → `E_CONTRACT_MISMATCH`

### 7.2 테스트 금지 사항

- 에러 message 문자열 직접 비교
- stack trace 비교
- 환경 의존 값 사용

---

## 8. PRD-007 스냅샷 가드레일

본 PRD 구현 시 다음 조건을 만족해야 한다.

- core 디렉토리 구조 변경 없음
- core ↔ sandbox 의존 방향 변경 없음
- 에러 추가는 **확장**이며 동작 변경이 아님

---

## 9. 확장 원칙 (Forward Compatibility)

본 PRD에 정의되지 않은 에러 정책은  
반드시 **새로운 PRD + Contract**를 통해서만 추가된다.

본 문서는  
향후 모든 실패 규칙의 기준선(baseline)으로 유지된다.

