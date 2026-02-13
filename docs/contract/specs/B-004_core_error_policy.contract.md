# B-004 : Contract Spec
(Core Error Policy)

---

## 1. 목적

본 Contract는 PRD-004 「Core Error Policy」의 의도를 기술적으로 강제하기 위한 규약이다. Core 레이어에서 발생하는 모든 실패는 본 Contract에 정의된 정책과 구조를 따라야 한다.

본 문서는 기능이 아닌, **실패에 대한 공통 규칙**을 정의하는 정책 자산(Policy Asset)이다.

---

## 2. 입력/출력 (Domain Level Contract)

- **입력 (Event)**: Core 내부의 불변식(Invariant), 상태, 입력 규칙 위반 이벤트.
- **출력 (Data)**: 명세화된 `CoreError` 객체. 이 객체는 `throw`를 통해 Core 경계 밖으로 전파된다.

---

## 3. ErrorCode 정책 테이블

Core 레이어는 다음의 ErrorCode만 생성하고 `throw`할 수 있다. 이 외의 코드는 Core에서 허용되지 않는다.

| ErrorCode                 | 의미 (Meaning)                         | 책임 레이어 |
| ------------------------- | -------------------------------------- | ----------- |
| `E_CORE_INVALID_INPUT`    | 입력 값의 유효성 검증 실패 (Pre-condition) | core        |
| `E_CORE_STATE_VIOLATION`  | 현재 상태에서는 실행될 수 없는 작업 시도 | core        |
| `E_CORE_INVARIANT_BROKEN` | Core의 핵심 불변식이 깨진 경우         | core        |
| `E_CONTRACT_MISMATCH`     | 상위 레이어와의 계약(ex: 데이터) 위반   | core        |

---

## 4. CoreError Shape 계약

Core에서 `throw`되는 모든 에러 객체는 다음 구조를 따라야 한다.

```ts
interface CoreError {
  /**
   * ErrorCode 정책 테이블에 정의된 문자열 코드
   */
  code: string;

  /**
   * 에러의 의미를 설명하는 개발자용 메시지 (UI용 아님)
   */
  message: string;

  /**
   * 추적 ID, 실패한 값 등 진단에 필요한 추가 정보 (선택 사항)
   * 비결정성 값은 포함될 수 없으나, 외부에서 주입된 trace_id 등은 허용
   */
  details?: Record<string, unknown>;

  /**
   * 저수준 에러를 Wrapping하는 경우 원인 (선택 사항)
   */
  cause?: unknown;
}
```

---

## 5. 레이어별 책임 계약

- **Core**:
  - **책임**: 비즈니스 규칙, 상태, 불변식 위반 시 `CoreError`를 생성하여 `throw`한다.
  - **금지**: `try/catch`를 통한 에러 처리, 로깅, 외부 I/O 에러 직접 노출.

- **Sandbox / Adapter**:
  - **책임**: Core에서 전파된 `CoreError`를 수신(catch)한다. 필요 시 로깅, 모니터링, 사용자 응답 변환 등의 후처리를 담당한다.
  - **금지**: 수신된 `CoreError`의 `code` 필드를 임의로 변경하거나 원본의 의미를 훼손하는 행위.

---

## 6. 실패 처리 계약

- **상태 불변 (State Immutability)**: `CoreError`가 발생한 작업은 시스템의 어떤 상태도 변경해서는 안 된다. 작업은 원자적(atomic)이며, 실패 시 롤백된 것과 동일한 효과를 보장해야 한다.
- **부분 성공 없음 (No Partial Success)**: 작업의 일부만 성공하고 일부는 실패하는 상태는 존재하지 않는다. 작업 전체가 성공하거나, 전체가 실패하고 아무런 변경도 없어야 한다.

---

## 7. 금지 사항 (Prohibitions)

다음 행위는 본 계약에 의해 명시적으로 금지된다.

- **`try/catch` in core**: `src/core` 디렉토리 내에서 `try/catch` 구문 사용 금지.
- **`message` 기반 테스트**: 테스트 케이스에서 에러 객체의 `message` 문자열을 비교하여 검증하는 행위 금지.
- **`code` 변조**: 상위 레이어에서 Core로부터 받은 에러의 `code`를 다른 값으로 변경하는 행위 금지.
- **`instanceof Error` 의존**: `instanceof CoreError`를 사용해야 하며, `instanceof Error` 와 같은 일반 에러 타입에 의존하는 테스트 및 로직 작성 금지.
- **비결정성 포함**: `Date.now()`, `Math.random()` 등 비결정적 값을 `CoreError` 내부에 포함하는 행위 금지.

---

## 8. 수용 기준 (Acceptance Criteria)

- 모든 실패 관련 테스트는 `CoreError`의 `code` 값을 기준으로 검증(assertion)되어야 한다.
- `src/core` 내부에 `try/catch` 문법이 존재하지 않음이 정적 분석(static analysis)을 통해 증명되어야 한다.
- PRD-007의 스냅샷 가드레일에 따라, 본 정책의 구현으로 인해 core의 디렉토리 구조나 의존성 방향이 변경되지 않아야 한다.
