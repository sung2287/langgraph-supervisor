# PRD-009: LLM Provider Abstraction & Routing

## 1. Objective / Background
로컬 모델(예: Ollama qwen2.5:7b)의 추론 속도 제약으로 인해 발생하는 개발 루프의 병목을 해결하고, 외부 API(예: Gemini, OpenAI)를 유연하게 연결하여 End-to-End 테스트를 가속화한다. "모델은 교체 가능한 어댑터"라는 철학에 따라 Core의 변경 없이 Runtime 환경 설정만으로 Provider를 전환할 수 있는 구조를 표준화한다.

### Mandatory References (LOCK)
- **철학**: 전략은 사람이, 시스템은 실행·기억·주입 (ai_orchestration_runtime_design_v_2)
- **로드맵**: Phase 0~3 완료, 외부 에이전트/모델 확장 (LANGGRAPH_DEVELOPMENT_ROADMAP)
- **메모리 원칙**: Summary 저장 금지, Decision/Evidence/Anchor 구조 유지 (idea_preservation_framework)
- **실행 계약**: v1.1 Step Contract LOCK (PRD-007)

---

## 2. Scope
### IN SCOPE
- LLM 호출을 위한 `LLMClient` 인터페이스 추상화
- `Provider Router` 도입: 환경 변수(ENV) 및 CLI Flag 기반 공급자 선택
- API Provider(Gemini AI Studio 등) 연동을 위한 규격 정의
- Timeout, Retry, Rate-limit(429) 대응 정책 표준화
- 관측 지표(Latency, Token/Character Count, 에러 코드) 정의

### OUT OF SCOPE
- 특정 모델의 프롬프트 엔지니어링 및 품질 튜닝
- 멀티모달(이미지, 음성 등) 데이터 처리
- RAG/인덱싱 최적화
- UI 구현 작업
- `PolicyInterpreter Contract`(PRD-008)의 로직 변경

---

## 3. Requirements

### 3.1 Interface Requirements (LOCK)
- **Core Port**: Core Engine은 오직 단일한 `LLMClient` 포트에 의존한다.
- **Provider Adapters**: 개별 공급자(Ollama, Gemini 등)의 SDK 및 HTTP 통신 로직은 `runtime/llm/**` 아래에 완전히 격리한다.
- **Response Schema**: 응답 객체는 반드시 다음 정보를 포함해야 한다.
    - `text`: 생성된 문자열 (string)
    - `usage`: (제공 시) `promptTokens`, `completionTokens`, `totalTokens`
    - `meta`: `model`, `provider`, `latencyMs`, `requestId`
    - `error`: 표준화된 에러 객체 (3.3 참조)

### 3.2 Routing Requirements
- **Selection Priority**: 공급자 선택은 다음 우선순위를 따른다.
    1. CLI Flag (예: `--provider gemini`)
    2. 환경 변수 (예: `LLM_PROVIDER=gemini`)
    3. Policy Profile Default (프로필에 정의된 경우)
- **No Implicit Fallback (LOCK)**: 
    - 공급자가 명시적으로 결정되지 않을 경우(CLI/ENV/Policy 모두 부재), 런타임은 시작 시 설정 오류(Configuration Error)를 발생시켜야 한다.
    - 로컬 공급자(Ollama)로의 Fallback은 명시적으로 선언된 경우에만 허용된다.
- **Explicit Only**: Router는 공급자를 "추측"하여 변경하지 않으며, 설정된 경로가 유효하지 않을 경우 즉시 에러를 반환한다.

### 3.3 Failure Semantics (LOCK)
- **Non-blocking Policy**: LLM 호출 실패가 런타임 자체를 중단(Fail-Fast)시켜서는 안 된다. 실패는 `Execution Cycle`의 상태로 기록된다. (단, 설정 오류 등은 시작 시 차단 가능)
- **Error Taxonomy**:
    - **Transient (재시도 가능)**: 429(Rate Limit), 503(Service Unavailable) 등 → 정책에 따라 N회 재시도 후 `CycleFail`.
    - **Permanent (즉시 실패)**: 401/403(Auth Error), 400(Invalid Request) → 즉시 `CycleFail`.
    - **Timeout**: 설정된 `timeoutMs` 초과 시 `CycleFail`.
- **Default Retry Policy**:
    - `defaultRetryCount`: 2
    - `retryBackoffMs`: 500ms exponential (예: 500ms, 1000ms)
    - `defaultTimeoutMs`: 30000ms (30s)
    - 이 값들은 설정을 통해 덮어쓸 수 있으나, 런타임 설정에 명시적으로 정의되어야 한다.

---

## 4. Design

### 4.1 Module Boundaries
- **Core (`src/core/**`)**: `LLMClient` 인터페이스 정의 및 `LLMCall` 스텝 처리.
- **Runtime Adapters (`runtime/llm/**`)**: `OllamaAdapter`, `GeminiAdapter` 등 구현.
- **CLI Entrypoints (`runtime/cli/**`)**: 환경 변수 로드 및 Router 초기화.

### 4.2 Standard Schema (Draft)
#### LLMRequest
- `inputText`: 입력 프롬프트
- `systemPrompt`: (Optional) 시스템 지시문
- `config`: `{ model, temperature, maxTokens, timeoutMs }`
- `trace`: `{ sessionId, executionId, mode, domain, stepId }`
    - `executionId`: 실행 계획 수행 간의 상관관계 추적을 위한 ID. 오직 관측 및 로그 연관성을 위해서만 사용되며, 결정 로직이나 영속성 동작에 영향을 주어서는 안 된다.

#### LLMResponse
- `text`: 결과 본문
- `usage`: `{ promptTokens, completionTokens }` (Optional)
- `meta`: `{ provider, model, latencyMs, requestId }`
- `error`: `{ code, message, isTransient }`

### 4.3 Observability (LOCK)
- **측정값 중심**: 로그에는 "요약(Summary)"을 저장하지 않으며, 오직 `latencyMs`, 토큰 수 등 "측정 데이터"만 기록한다.
- **Provider Tracking**: 모든 응답 메타데이터에 실제 실행된 Provider와 모델명을 기록하여 성능 비교의 근거로 삼는다.
- **Usage Integrity**: 공급자로부터 사용량(Usage) 정보를 얻을 수 없는 경우, 이를 추정하지 않고 생략(Omit)한다. 문자 수 기반의 인위적인 토큰 추정(Artificial estimation)은 금지된다.

---

## 5. CLI & Operational UX
- **LLM Smoke CLI**: 개별 공급자의 연결성을 즉시 검증하는 명령어를 제공한다.
    - `npm run smoke:llm -- --provider gemini`
    - 목적: API Key 유효성, 네트워크 도달성, 기본 응답 스키마 1회 확인.
- **Secrets Management**: API Key는 절대 코드나 설정 파일에 하드코딩하지 않으며, `.env` 또는 시스템 환경 변수를 통해서만 주입받는다.

---

## 6. Definition of Done (DoD)
- [ ] `LLMClient` 인터페이스 및 `Provider Router` 설계 확정.
- [ ] Timeout/Retry 정책 및 Error Taxonomy 정의 완료.
- [ ] Smoke CLI를 통한 공급자별 호출 검증 경로 설계 포함.
- [ ] PRD-004~007로 정의된 기존 영속성/실행 계약과의 충돌 없음 확인.

---

## 7. Decisions Needed (결정 사항)
- **Policy Default**: 개별 정책 프로필(policy profile) 내부에 특정 모델명(예: `gemini-1.5-flash`)까지 명시하는 것을 허용할 것인가?
- **CLI Flag Priority**: 실행 시 전달된 Flag가 ENV 설정을 항상 덮어쓰도록 강제할 것인가? (현재 요구사항은 1순위로 설정됨)

---

## 8. Risks & Mitigation
- **API Cost/Quota**: 외부 API 사용 시 비용 및 쿼터 소진 리스크 → 호출 단위의 Usage 로깅 및 테스트 모드(Smoke) 활용.
- **Network Instability**: 로컬 모델과 달리 네트워크 상태에 따른 간헐적 실패 발생 → Transient 에러에 대한 Retry 로직 및 명확한 에러 전파(CycleFail).
- **Security**: API Key 유출 위험 → `.env.example`에 키 이름만 표기하고 `.gitignore`를 엄격히 적용.

---
*Last Updated: 2026-02-21 (MVP v1 Lock Confirmed)*
