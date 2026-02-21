# B-009: LLM Provider Abstraction & Routing Contract

## 1. LLMClient Port Contract
Core Engine은 외부 LLM 공급자의 상세 구현을 알지 못하며, 오직 아래 명세된 인터페이스를 통해서만 통신한다.

- **Interface Method**: `request(payload: LLMRequest): Promise<LLMResponse>`
- **No Raw Provider Errors**: 어댑터는 공급자(Ollama, Gemini SDK 등)의 원시 에러를 그대로 외부로 던지지 않는다. 모든 에러는 `LLMResponse.error` 표준 객체로 래핑하여 반환해야 한다.
- **Standard Error Object Shape**:
  ```json
  {
    "code": "string",
    "message": "string",
    "isTransient": "boolean",
    "providerCode": "string (optional)"
  }
  ```
  - `providerCode`는 선택 사항이며 오직 관측성(observability)을 위해서만 사용된다.
  - 에러 객체는 어떠한 경우에도 SDK의 원시 스택 트레이스(stack trace)를 포함해서는 안 된다.
- **Async Execution**: 모든 호출은 비동기(`Promise`)로 처리되며, 타임아웃은 어댑터 레벨에서 관리한다.

## 2. Router Contract (Selection Logic)
공급자 인스턴스를 결정하는 로직은 다음의 엄격한 우선순위를 따른다며, 결정에 실패할 경우 런타임 시작 단계에서 차단한다.

- **Resolution Priority**:
    1. **CLI Flag**: `--provider` 인자 명시 시 최우선 적용.
    2. **Environment Variable**: `LLM_PROVIDER` 변수 값 참조.
    3. **Policy Profile Default**: 정책 프로필에 기본 공급자가 정의된 경우.
- **No Implicit Fallback (LOCK)**: 위 3단계에서 공급자가 결정되지 않을 경우, 임의로 `local` 모델을 선택하지 않는다.
- **Configuration Error**: 공급자 결정 실패 또는 유효하지 않은 공급자 명시 시, 런타임 시작(Boot) 시점에 `ConfigurationError`를 발생시키고 프로세스를 중단한다.

ConfigurationError must occur strictly during runtime bootstrap,
before any executionPlan is constructed or any Step execution begins.
This guarantees separation between configuration validation and cycle-level failure semantics.

## 3. Failure & Reliability Contract
LLM 호출 과정에서 발생하는 오류는 다음과 같이 분류하여 처리한다.

- **Transient Errors (재시도 대상)**: 429(Rate Limit), 503(Service Unavailable), 네트워크 순시 에러 등.
    - **Retry Policy**:
      - `maxAttempts = 3` (initial attempt + 2 retries)
      - Backoff schedule:
        - attempt 2 → 500ms delay
        - attempt 3 → 1000ms delay
      - Retries are executed strictly within the adapter boundary.
      - Core must not implement retry logic directly.
    - 재시도 소진 시 `CycleFail`로 전환한다.
    - **Retry Scope**: 어댑터는 재시도 시 부수 효과가 중복 발생하지 않도록 멱등성(Idempotency)을 보장해야 한다.
- **Permanent Errors (즉시 중단)**: 401/403(Auth/Key Error), 400(Invalid Schema) 등.
    - 재시도 없이 즉시 `CycleFail` 처리한다.
- **Timeout Errors**: 설정된 `timeoutMs` 초과 시 즉시 `CycleFail` 처리한다.
- **No FailFast (LOCK)**: LLM 호출 실패는 어떠한 경우에도 `FailFast`(전체 프로세스 강제 종료)를 유발해서는 안 된다. `FailFast`는 오직 저장소 무결성 및 계약 위반 상황에 대해서만 보존된다.
    - `ConfigurationError`는 실행 시작 전 프로세스를 중단할 수 있는 유일한 예외 상황이다.
    - 모든 공급자 런타임 에러는 `CycleFail`로 변환되어야 하며, 처리되지 않은 예외(unhandled exception)로 전파되어서는 안 된다.

## 4. Observability & Data Integrity Contract
모든 LLM 응답은 시스템의 투명성을 위해 다음 규약을 준수해야 한다.

- **Required Fields**:
    - `latencyMs`: 클라이언트 측에서 측정한 순수 요청-응답 시간.
    - `provider` / `model`: 실제 실행된 공급자와 모델명.
- **Usage Fields (Optional)**:
    - 공급자가 토큰 정보를 제공할 때만 기록한다.
    - **No Artificial Estimation**: 문자 수 등을 이용한 인위적인 토큰 추정을 금지한다. 정보 부재 시 해당 필드를 생략(Omit)한다.

## 5. Architectural Isolation Contract (LOCK)
Core와 Runtime 어댑터 레이어는 다음과 같이 물리적으로 격리된다.

- **Import Restriction**: `runtime/llm/**` 폴더 내의 코드는 `src/core/**` 내부의 비즈니스 로직을 직접 `import`할 수 없다. Type-only imports from `src/core/**` are permitted using TypeScript's type import semantics. Runtime logic imports from Core into `runtime/llm/**` are strictly prohibited.
- **Dependency Inversion**: Core Engine은 특정 공급자의 SDK(예: `@google/generative-ai`)를 직접 의존성으로 가질 수 없으며, 오직 `LLMClient` 추상 인터페이스만 참조한다.

---
*Last Updated: 2026-02-21 (MVP v1 Lock Confirmed)*
