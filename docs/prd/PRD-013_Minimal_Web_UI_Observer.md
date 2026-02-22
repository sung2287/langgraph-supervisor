# PRD-013: Minimal Web UI (Observer v1)

## 1. 목적 (Goal)
CLI의 텍스트 기반 인터페이스를 넘어, 실행 상태와 모드를 시각적으로 확인하고 최소한의 입력 및 제어를 수행할 수 있는 웹 기반 관찰자(Observer) 인터페이스를 제공한다.

## 2. 핵심 가치 (Core Values)
- **Observer-Only**: 엔진의 실행 단계(`Step`)를 제어하거나 순서를 변경하지 않는 **읽기 전용 관찰**에 집중한다.
- **Core-Zero-Mod**: `src/core` 수정 없이 `runtime/` 및 어댑터 레이어 확장을 통해서만 UI를 연동한다.
- **Namespace-Isolation**: CLI 세션과 웹 세션이 충돌하지 않도록 네임스페이스를 분리한다.

## 3. 설계 요구사항 (Requirements)

### 3.1 세션 네임스페이스 (Namespace-Split)
- **Web Session Structure**: `session_state.web.<sessionId>.json` 구조로 구체화한다.
- **Session ID Strategy**: 웹 세션의 `<sessionId>`는 랜덤 기반 UUID가 아닌, CLI 세션 생성 체계와 동일한 규칙으로 런타임에서 생성한다.
- **Isolation Policy**: CLI (`session_state.json`)와 절대 파일을 공유하지 않으며, 웹 세션에는 반드시 `web.` prefix를 강제한다.
- **Auto-Rotation**: 웹 세션 역시 10개 이상의 이력이 쌓이면 자동 로테이션(FIFO)을 수행한다.

### 3.2 동시성 및 통신 (Single-Writer Rule)
- **Concurrency Strategy**: 웹 어댑터는 동일 세션에 대해 동시 요청 발생 시 `in-flight guard` 전략을 사용하여 이전 요청이 완료될 때까지 새 요청을 거부하거나 큐(`Queue`)에 적재한다.
- **Scope**: `in-flight guard`는 Runtime Adapter의 프로세스 메모리(Process Memory) 범위 내에서만 유효하다.
- **State Reset**: 서버 프로세스 재시작 시 `in-flight` 상태는 초기화된다.
- **Exclusion**: 분산 환경 또는 멀티 프로세스 환경을 위한 별도의 락(Lock) 메커니즘은 v1 범위에 포함되지 않는다.

### 3.3 Runtime Entry 경계 강화
- **Unified Entry Point**: 웹 어댑터는 `run_local.ts`와 동일한 `Runtime Orchestrator` 계층을 유일한 진입점으로 사용해야 한다.
- **CLI Parsing Bypass**: CLI 파싱 레이어는 우회 가능하나, `Core Graph` 실행 엔트리는 CLI와 동일해야 한다.
- **No Direct Core Import**: `src/core` 내의 모듈을 직접 임포트(`import`)하거나 함수를 호출하는 행위는 엄격히 금지된다.

### 3.4 UI 범위 및 기능 (Observer-v1)
- **Read-only Step State**: 현재 실행 중인 단계를 진행률 바(Progress Bar)나 리스트 형태로 표시할 수 있으나, 수정은 불가하다.
- **Simple Rerun**: 웹 UI는 전체 재실행(**Rerun from Start**) 기능만 제공하며, 특정 단계부터 재실행하거나 부분 실행하는 기능은 제공하지 않는다.

## [NEW LOCK] HashMismatch UX Consistency
* **Web UI는 HashMismatch 발생 시 자동 세션 로테이션을 수행하지 않는다.**
* **반드시 사용자 명시적 동의를 요구하며, 동의 후 로테이션은 CLI의 --fresh-session과 동일한 정책을 따른다.**
* **자동 세션 생성 및 자동 덮어쓰기는 엄격히 금지된다.**

## 4. 실패 케이스 및 예외 처리 (Failure Cases)
- **Session Conflict**: 
  - **정의**: Runtime Adapter의 메모리 영역에 있는 **in-flight guard**를 기준으로 정의한다. 동일한 `sessionId`에 대해 두 개 이상의 동시 실행 요청이 인입될 경우 컨플릭트로 간주한다.
  - **제약**: 파일 존재 여부나 파일 시스템 레벨의 락(Lock)만으로 활성 세션을 판단하지 않는다.
  - **무결성**: 세션 상태 파일 내부에 별도의 `active` 플래그를 추가하거나, Core 및 `session_state` 구조를 변경하여 상태를 관리하는 행위는 엄격히 금지된다.
  - **처리**: `runtime/error.ts`에 정의된 에러 코드 체계를 사용하여 사용자에게 알림을 제공한다.
- **Runtime Crash Strategy**: 런타임 엔진 충돌 시 **Rerun from Start** 기능만 제공하며, 충돌 지점부터 이어서 실행하는 자동 복구는 v1 범위 밖이다. 세션 무결성 검증(Session Integrity Check) 후 재실행만 허용한다.

## [CLARIFICATION] In-flight Guard Scope
* **In-flight guard는 프로세스 메모리 범위에서만 유효하다.**
* **서버 재시작은 세션 종료로 간주하며, 실행 상태를 session_state에 영구 플래그로 기록하지 않는다.**
* **파일 시스템 Lock, SQLite 확장, WAL 기반 동시성 제어는 v1 범위 밖이다.**

## 5. Plan Hash Clarification
- **Execution Context Reflect**: `Plan Hash`는 `ExecutionPlan` 구조와 `execution context metadata`(`provider`, `model`, `mode`, `domain`)를 기반으로 계산된다. 
- **Deterministic**: 해시 계산은 결정론적이어야 하며 가변 정보(timestamp, random)를 포함할 수 없다.
- **Secret Exclusion**: `secretProfile` 명칭 및 실제 API Key 값은 `execution context metadata`에 포함되지 않으며, `Plan Hash` 계산에 영향을 주어서는 안 된다.

## [NEW LOCK] Secret Exclusion Boundary
* **SecretProfile 명칭은 UI 표시용 메타데이터일 뿐이다.**
* **ExecutionContextMetadata에 포함되지 않으며, Plan Hash 계산에 절대 영향을 주지 않는다.**
* **Secret 값 및 SecretProfile 명은 stableStringify 입력값이 될 수 없다.**

## 6. Runtime Boundary Rule
- **No Direct Core Import**: `src/core` 모듈을 직접 임포트하는 행위는 금지된다.

## 7. Deterministic Execution Rule
- **Deterministic**: Plan Hash 및 실행 로직은 결정론적이어야 한다.
- **No Structural Change**: UI 요소는 `ExecutionPlan`의 구조를 절대 변경하지 않는다.
- **Extensions Field**: `ExecutionPlan.extensions`는 항상 `[]`를 유지한다.

## 8. LOCK Summary & Prohibitions
- **LOCK Summary**:
  - **Core-Zero-Mod**: `src/core` 수정 금지.
  - **Namespace-Split**: 웹 전용 세션 저장소 및 네임스페이스 사용.
  - **No-Extensions-Usage**: `extensions` 필드 활용 금지.

## [RED FLAG] 명시적 거부 규칙
* **FileSessionStore에 파일 락(Lock) 기능 추가 금지**
* **SQLite 기반 세션 저장소 확장 금지**
* **session_state에 active/inFlight 플래그 추가 금지**
* **Core GraphState 타입 변경 금지**

---
**Design Rejection Required**: 웹 어댑터가 런타임을 통하지 않고 `src/core`를 직접 호출하여 세션을 강제 수정하거나 삭제하려는 설계는 무결성 파괴로 간주됨.
