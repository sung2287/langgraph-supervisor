# B-013: Web UI Observer Contract

## 1. 개요 (Overview)
본 문서는 웹 어댑터와 엔진 간의 인터페이스 및 웹 세션 관리 규격을 정의한다. 초기 버전(v1)은 엔진의 실행 단계(`Step`)를 제어하지 않는 **읽기 전용 관찰**에 집중한다.

## 2. 공통 원칙 (Common Principles)
- **Core-Zero-Mod**: `src/core/**` 수정 금지.
- **No-Extensions-Usage**: `ExecutionPlan.extensions`는 항상 `[]`를 유지한다.
- **Namespace-Isolation**: CLI 세션과 웹 세션이 충돌하지 않도록 네임스페이스를 분리한다.
- **Fail-Fast Consistency**: 에러는 `runtime/error.ts`의 표준 코드 체계를 사용한다.

## [NEW LOCK] Web DTO Isolation
* **Web Adapter는 src/core/** 타입을 직접 import하지 않는다.**
* **Core GraphState, ExecutionPlan 타입을 API로 직접 노출하지 않는다.**
* **runtime/web/mapper.ts 계층을 통해 Core -> WebGraphSnapshot 변환을 수행한다.**
* **WebGraphSnapshot은 Core 구조와 1:1 대응을 보장하지 않는다.**
* **UI 요구 변경은 Core 타입 변경을 유도해서는 안 된다.**

## [NEW LOCK] Core Literal Dependency Prohibition
* **Web Adapter는 Core 내부 enum, literal string, 상수 값(mode, domain, step name 등)에 직접 의존하지 않는다.**
* **Core의 문자열 값에 대한 하드코딩을 금지한다.**
* **UI 표시에 필요한 문자열은 Runtime Orchestrator 또는 Projection Layer(mapper)에서 안전하게 전달받는다.**
* **Core 내부 문자열 변경이 Web Adapter 수정으로 이어지는 구조는 허용되지 않는다.**

*   ❌ **금지**: `if (state.mode === "design") { ... }`
*   ❌ **금지**: `if (currentStep === "persistAnchor") { ... }`
*   ✔ **허용**: `if (snapshot.currentStepLabel === "Persist Anchor") { ... }`

## 3. 데이터 구조 (Web Adapter Interface & DTO)

### 3.1 IWebRuntimeAdapter (Adapter Layer)
웹 어댑터는 `run_local.ts`와 동일한 런타임 오케스트레이터(Runtime Orchestrator) 계층을 진입점으로 사용한다.

```typescript
/** 웹 어댑터 인터페이스 */
export interface IWebRuntimeAdapter {
  /** 
   * 세션 네임스페이스 기반 실행 컨텍스트 생성.
   * sessionId는 runtime 규칙(sanitize 및 prefix 강제)을 따라 생성한다.
   */
  initWebSession(sessionId: string): Promise<WebSessionContext>;
  
  /** 
   * 현재 엔진의 상태(GraphStateSnapshot) 조회.
   * GraphStateSnapshot은 UI DTO이며 Core GraphState와 무관하다.
   */
  getCurrentState(): Promise<GraphStateSnapshot>;
}

/** UI 전용 DTO (Core 타입 import 금지) */
export interface GraphStateSnapshot {
  sessionId: string;
  mode: string;
  domain: string;
  activeProvider: string;
  activeModel: string;
  history: Array<{ role: string; content: string }>;
  currentStepLabel?: string;
  isBusy: boolean; // in-flight guard 상태
  lastError?: { errorCode: string; guideMessage: string };
}
```
- **Projection Rule**: `GraphStateSnapshot`은 `session_state` 파일에 기록된 데이터의 read-only projection 또는 `Runtime Orchestrator`가 제공하는 안전한 조회 API를 통해 생성된다. 
- **Isolation**: 웹 어댑터는 `session_state` 파일을 직접 수정하지 않으며, `Core` 내부의 `GraphState` 타입과 1:1 매핑을 보장하지 않는다.
- **Read Boundary**: Web Adapter는 `session_state.web.*.json`를 read-only로 파싱하여 UI용 DTO를 생성할 수 있으나, Core의 내부 계산 로직(Plan/Step resolution, ordering, gating 등)을 재현하거나 추론해서는 안 된다. 실행 상태 계산은 Runtime Orchestrator가 제공하는 조회 API를 단일 책임(SSOT)으로 사용한다.

## [CLARIFICATION] Step Label Boundary
- **currentStepLabel은 UI 표시용 문자열이다.**
- **Core 내부 Step ID 또는 enum literal을 직접 노출하지 않는다.**
- **Web Adapter는 Core Step 이름에 대한 하드코딩 비교를 수행해서는 안 된다.**
- **Step 표시 문자열은 Runtime Orchestrator 또는 Projection Layer(mapper)에서 안전하게 가공된 값이어야 한다.**

## [NEW LOCK] Secret Exclusion Boundary
* **SecretProfile 명칭은 UI 표시용 메타데이터일 뿐이다.**
* **ExecutionContextMetadata에 포함되지 않으며, Plan Hash 계산에 절대 영향을 주지 않는다.**
* **Secret 값 및 SecretProfile 명은 stableStringify 입력값이 될 수 없다.**

## 4. 세션 명명 규칙 (Session Naming Convention)
- **Web Session Path**: `session_state.web.<sessionId>.json` 고정.
- **Backup Rule**: 백업 로직은 `FileSessionStore`가 제공하는 기본 정책에 위임한다. 계약(Contract)에서 임의로 경로(timestamp 등)를 강제하지 않는다.
- **Path Root Delegation**: `session_state.web.<sessionId>.json`의 저장 루트 디렉토리는 `FileSessionStore`의 기본 경로 정책에 위임한다. Web Adapter는 별도의 루트 경로를 정의하거나 하드코딩하지 않는다.

## 5. 실패 정의 (Failure Semantics)
- **SESSION_CONFLICT**: `in-flight guard`(프로세스 메모리) 기준으로 이미 동일 세션에 대해 실행 요청이 처리 중일 때 발생한다. (멀티 프로세스/탭 판별은 v1 범위 밖이다.)
- **PLAN_HASH_MISMATCH**: 기존 세션과 현재 오버라이드 옵션 간 해시 불일치 시 발생한다.

## 6. RED FLAG (Design Rejection Required)
- `ExecutionPlan.extensions` 오염 금지.
- `src/core` 타입(GraphState, ExecutionPlan 등) 직접 임포트 금지.
- **src/core 타입을 재-export(re-export) 경유로 간접 의존하는 행위 금지**
- **Core 타입을 다른 레이어를 통해 우회적으로 import하는 구조 금지**
- `session_state.json` 구조 변경 금지.
- 웹 어댑터에서 `src/core` 내부 함수를 직접 호출하는 행위 금지 (반드시 Runtime Orchestrator 경유).
