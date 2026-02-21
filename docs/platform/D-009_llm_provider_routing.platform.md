# D-009: LLM Provider Abstraction & Routing Platform

## 1. Module Layout (물리 구조)
시스템의 구성 요소는 책임에 따라 다음과 같이 분리되어 배치된다.

- **`src/core/plan/**`**:
    - `LLMClient` 추상 인터페이스 정의.
    - `LLMCall` Step의 실행 로직 및 Result Ledger 기록 처리.
- **`runtime/llm/**`**:
    - `GeminiAdapter`, `OllamaAdapter` 등 구체적인 공급자 클래스.
    - 외부 SDK 연동 및 HTTP 클라이언트 로직 격리.
    - `LLMProviderRouter` 구현체.
- **`runtime/cli/**`**:
    - 실행 인자(CLI Flag) 파싱 및 환경 변수(`dotenv`) 로드.
    - Router 인스턴스 초기화 및 Core 주입.
- **`policy/profiles/**`**:
    - 각 정책 프로필별 기본 `provider`, `model` 설정값 정의.

## 2. Dependency Rules (의존성 규칙)
레이어 간의 결합도를 낮추고 Core의 중립성을 보호하기 위해 다음 규칙을 강제한다.

- **SDK Isolation**: `runtime/llm/**` 내부의 어댑터만 외부 공급자 SDK(예: `@google/generative-ai`)를 직접 의존성으로 가질 수 있다.
- **Core Neutrality**: `src/core/**`는 어떠한 특정 LLM 공급자의 SDK도 직접 참조하거나 `import` 할 수 없다. 오직 추상화된 타입과 인터페이스만 사용한다.
- **Initialization Boundary**: Router의 구체적인 구현체 선택 및 초기화 로직은 오직 CLI 레이어(`runtime/cli/**`)에서만 수행된다.
- **No Reverse Coupling**:
  `src/core/**` must never import from `runtime/**`.
  The dependency direction is strictly one-way:
  Core → Port Interface → Runtime Adapter (injected at boundary).
  - Runtime adapters must not mutate Core state directly.
  - All state transitions must pass through PlanExecutor.

## 3. Configuration Layer (설정 계층)
실행 시점의 동작은 환경 변수와 CLI 인자를 통해 제어된다.

- **Environment Variables**:
    - `LLM_PROVIDER`: 사용할 공급자 식별자 (예: `gemini`, `ollama`).
    - `LLM_MODEL`: 해당 공급자 내의 구체적인 모델명.
    - `LLM_TIMEOUT_MS`: API 호출 제한 시간 (Default: `30000`).
- **Priority Logic**:
    - **CLI Flag** (`--provider`)가 존재할 경우 환경 변수 설정을 항상 무시(Override)한다.
    - 명시적인 설정이 전혀 없을 경우 시작 단계에서 실행을 거부한다.

### Bootstrap Phase Definition
- Environment resolution
- CLI argument parsing
- Provider resolution
- Adapter initialization

No executionPlan construction may occur before bootstrap completes successfully.

## 4. Execution Flow Diagram (실행 흐름)
런타임 구동부터 결과 반환까지의 데이터 흐름은 다음과 같다.

```text
[Startup]
CLI (Args + ENV) 
   ↓
Router (Initialize Provider Instance)
   ↓
[Cycle Start]
PlanExecutor (LLMCall Step Trigger)
   ↓
LLMProviderRouter (Route to Adapter)
   ↓
Provider Adapter (SDK/HTTP Request)
   ↓
LLM API (External Inference)
   ↓
Standardized LLMResponse (Mapping)
   ↓
PlanExecutor (Record to Result Ledger)
```

Note:
Provider Adapter must return standardized LLMResponse
regardless of internal SDK behavior.
No SDK-specific object may cross the adapter boundary.

## 5. Non-Goals (v1 제약 사항)
초기 버전의 복잡도를 낮추기 위해 다음 기능은 플랫폼 범위에서 제외한다.

- **No Caching Layer**: 동일 요청에 대한 결과 캐싱 로직은 v1에 포함하지 않는다.
- **No Batching**: 여러 요청을 묶어서 처리하는 배치 레이어는 지원하지 않는다.
- **No Streaming**: 생성 결과를 실시간으로 받는 스트리밍 핸들링은 v1 명세에서 제외하며, 오직 완전한 응답(Complete Response)만 처리한다.

---
*Last Updated: 2026-02-21 (MVP v1 Lock Confirmed)*
