# B-006_adapter_layer.contract.md

## 1. 목적 (Purpose)

본 문서는 **Adapter Layer와 Core Layer, 그리고 External(외부) 간의 데이터 및 행위 계약을 물리적으로 고정**하는 것을 목적으로 한다.
이 계약은 타협할 수 없으며, 모든 구현은 이 계약을 준수해야 한다.

---

## 2. Adapter → Core Input Contract

Adapter는 외부의 요청을 **Core가 이해할 수 있는 순수한 형태(Input DTO)** 로 변환하여 전달해야 한다.

### 2.1 Input DTO 구조 규칙
- **Pure Data Structure**: Input DTO는 메서드를 가지지 않는 순수 데이터 객체여야 한다.
- **No External Dependency**: 외부 라이브러리(express, commander 등)의 객체를 포함할 수 없다.
- **Validation Responsibility**: 1차적인 형식(Format) 검증은 Adapter가 수행하나, 비즈니스 유효성 검증은 Core의 책임이다.

### 2.2 비결정적 값 주입 (Dependency Injection)
Core는 순수 함수에 가까워야 하므로, 비결정적(Non-deterministic) 값은 Adapter가 생성하여 주입한다.

| 구분 | 주입 주체 | 전달 방식 | Core 제약 |
|---|---|---|---|
| **UUID (ID)** | Adapter | Input DTO 필드 포함 | Core 내부에서 직접 생성 금지 |
| **Timestamp (Time)** | Adapter | Input DTO 필드 포함 | Core 내부에서 `Date.now()` 등 직접 호출 금지 |
| **Trace ID** | Adapter | Input DTO / Context | Core 로깅 및 에러 추적용으로만 사용 |

### 2.3 Port Interface 사용
- Adapter는 Core의 구현체(Service, Repository impl)를 직접 참조하지 않는다.
- 반드시 `core/ports`에 정의된 **Interface**를 통해서만 Core 기능을 호출한다.

---

## 3. Core → Adapter Output Contract

Core의 실행 결과는 Adapter에게 **추상화된 결과**로 반환되며, Core의 내부 상태(Domain Entity)는 절대로 외부로 유출되지 않는다.

### 3.1 Output 구조
- Core는 성공 시 `Result<T>` 또는 정의된 `Output DTO`를 반환한다.
- **Core Domain Entity 직접 반환 금지**: Core의 Entity 객체(메서드가 포함된 도메인 모델)는 Adapter로 넘어가는 즉시 DTO로 매핑되거나, Core 내부에서 DTO로 변환되어 반환되어야 한다.

### 3.2 Response Mapping
- Adapter는 Core로부터 받은 결과를 **External Response DTO**로 매핑할 책임이 있다.
- Core의 반환 값 구조가 변경되더라도, Adapter가 이를 흡수하여 외부 계약(API Response 등)을 유지해야 한다.

---

## 4. Error Contract

에러 처리는 **PRD-004 Core Error Policy**를 따른다. Adapter는 Core의 에러를 해석하여 외부 프로토콜(HTTP, CLI 등)에 맞는 형태로 변환한다.

### 4.1 에러 분류 및 매핑 테이블

| Error Source | Error Code | Public Message | HTTP Status | CLI Exit Code | 비고 |
|---|---|---|---|---|---|
| **Adapter** | `E_ADAPTER_VALIDATION` | Y (Input Error) | 400 Bad Request | 1 | 요청 형식 오류 |
| **Core** | `E_CORE_INVALID_INPUT` | Y (Logic Error) | 422 Unprocessable | 1 | 비즈니스 규칙 위반 |
| **Core** | `E_CORE_STATE_VIOLATION` | N (Internal) | 409 Conflict | 1 | 상태 불일치 |
| **Core** | `E_CORE_INVARIANT_BROKEN`| N (Internal) | 500 Internal Error | 2 | 불변식 붕괴 (심각) |
| **Core** | `E_CONTRACT_MISMATCH` | N (Internal) | 500 Internal Error | 2 | 내부 계약 위반 |
| **System** | `E_INTERNAL_ERROR` | N (Internal) | 500 Internal Error | 2 | 알 수 없는 오류 |

### 4.2 Error Handling 규칙
- **Adapter Validation Error**: 요청 파싱, 필수 필드 누락 등 Core 진입 전 발생하는 에러.
- **PublicMessage**: `Y`인 경우 사용자에게 에러 메시지를 그대로 노출해도 된다. `N`인 경우 "Internal Server Error" 등으로 마스킹해야 한다.

---

## 5. Explicit Prohibition (명시적 금지 사항)

다음 항목은 절대 허용되지 않으며, 발견 즉시 **Contract 위반**으로 간주한다.

1.  **Adapter의 비즈니스 판단 금지**: Adapter는 요청을 라우팅하고 변환할 뿐, 비즈니스 로직(예: 권한 검사, 상태 변경 판단)을 수행해서는 안 된다.
2.  **Core Entity 외부 노출 금지**: Response Body에 Core Entity가 그대로 직렬화되어 나가는 것을 금지한다.
3.  **외부 라이브러리 객체 Core 전달 금지**: `req`, `res` (Express), `Command` (Commander) 객체 등을 Core 함수 인자로 전달하는 것을 금지한다.