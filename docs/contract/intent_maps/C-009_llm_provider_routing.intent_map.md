# C-009: LLM Provider Abstraction & Routing Intent Map

## 1. Intent: External Inference (외부 추론 실행)
시스템이 인지한 컨텍스트를 바탕으로 외부 지능(LLM)에 답변 생성을 요청하는 핵심 의도이다.

- **Trigger**: `executionPlan` 내의 `LLMCall` Step 실행.
- **Actor**: Runtime Adapter (`runtime/llm/**` 내의 구체적 구현체).
- **Execution**: 
    - 조립된 프롬프트 전달.
    - 비차단(Non-blocking) 비동기 호출.
- **Goal**: 텍스트 생성 결과물(`text`)과 실행 품질 지표(`metadata`)를 확보하여 `Result Ledger`에 기록.

## 2. Intent: Provider Selection (공급자 결정)
실행 환경 및 사용자 의도에 따라 가장 적합한 추론 엔진을 결정하는 의도이다.

- **Trigger**: 런타임 시작(Boot) 시점의 CLI 인자, 환경 변수, 정책 프로필 로드.
- **Decision Flow**: 
    - **Deterministic Resolution**: 사전에 정의된 우선순위(CLI > ENV > Policy)에 따라 결정하며, 시스템이 임의로 공급자를 추측하거나 선택하지 않는다.
    - v1 selection sources are CLI/ENV only; Policy-based defaults are deferred.
- **Goal**: 실행 전 추론 엔진의 가용성을 확정하고, 유효하지 않은 설정일 경우 즉시 차단하여 불확실한 실행을 방지한다.

## 3. Intent: Failure Handling (오류 처리 및 복구)
네트워크 환경의 불안정성이나 외부 서비스의 제약 사항에 대응하여 시스템의 안정성을 유지하는 의도이다.

- **Transient Error Intent**: 일시적 장애(429, 503, Timeout) 발생 시, 지수 백오프 기반의 **Retry Loop**를 통해 실행 성공 가능성을 극대화한다.
- **Permanent Error Intent**: 인증 실패나 스키마 오류 등 복구가 불가능한 상황에서는 즉시 **CycleFail**을 발생시켜 잘못된 추론 결과가 시스템 상태를 오염시키는 것을 방지한다.
- **Config Error Intent**: 공급자 식별 불가 또는 필수 키 누락 시, 실행을 시작하지 않고 **Startup Abort** 처리하여 자원 낭비를 방지한다.

## 4. Non-Intent (비의도 사항)
설계자가 의도하지 않은 동작을 명시하여 아키텍처 오염을 방지한다.

- **No Logic Influence**: 사용된 LLM 공급자(예: Gemini vs Ollama)의 종류가 `Decision`이나 `Evidence`의 저장 로직(SSOT 정합성)에 영향을 주어서는 안 된다.
- **No Step Modification**: 특정 공급자의 응답 속도나 특성을 이유로 `executionPlan`의 canonical order(순서 계약)를 동적으로 변경하는 행위를 금지한다.
- **No Implicit Fallback**: 명시적 설정이 없을 때 로컬 모델로 자동 전환하는 "편의 기능"은 설계 의도에 포함되지 않는다. 모든 선택은 명시적이어야 한다.

---
*Last Updated: 2026-02-21 (MVP v1 Lock Confirmed)*
