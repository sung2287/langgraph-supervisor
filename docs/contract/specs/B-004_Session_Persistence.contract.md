# B-004: Session Persistence Contract

## 1. Data Invariant Rules (Prohibitions)

- **Internal State Exposure Prohibited**: `SessionState`는 Core Engine 내부의 `GraphState`(nodes, values 등)를 포함하거나 직렬화하여 저장할 수 없다. 오직 참조(Ref) 정보만을 허용한다.
- **Execution Plan Storage Prohibited**: `executionPlan` 원문을 세션 파일에 저장하는 것을 금지한다. 오직 검증을 위한 fingerprint(Hash) 정보만 허용한다.
- **Storage Field Whitelist**: 아래 필드 외의 추가 정보 저장을 금지한다.
    - `sessionId`, `memoryRef`, `repoScanVersion`, `lastExecutionPlanHash`, `updatedAt`

## 2. Validation Rules (Strict Fail-Fast)

- **Hash Integrity**: `lastExecutionPlanHash`는 `policyRef`와 생성된 `executionPlan`의 결합으로 생성된 결정론적(Deterministic) 지문이어야 한다.
- **Hash Computation is Outside of Store**: `SessionStore`는 `lastExecutionPlanHash`를 직접 생성/계산/재구성할 수 없다. 해시는 Runtime(PolicyInterpreter)에서 산출되어 전달되며, Store는 오직 외부에서 제공된 기대값과 파일의 해시를 비교(Verify)하는 책임만 진다.
- **Auto-Initialization Prohibited**: 파일이 존재하지만 해시가 불일치하는 경우, 시스템은 절대로 데이터를 초기화하고 다시 시작해서는 안 된다. 이 상황은 '정책 변경에 의한 세션 오염 위험'으로 간주하며 즉시 실행을 중단(Fail-Fast)해야 한다.
- **Persistence Timing**: 세션 저장은 반드시 Execution Cycle이 완전히 종료된 시점에 1회만 수행한다. 작업 중간에 체크포인트를 생성하거나 부분 저장하는 행위를 금지한다.
- **No Boot-time Creation**: Boot Stage(런타임 시작 시)에서 `session_state.json` 파일을 새로 생성하는 것을 금지한다. 최초 파일 생성 또한 반드시 Cycle 종료 시점의 save(1회)에서만 허용된다.

## 3. Session Start Protocol

- **Case A: No File**: Cold Start로 간주하고 초기 상태를 생성한다. (파일은 종료 시 생성)
- **Case B: File Exists + Hash Match**: Resume으로 간주하고 세션 참조 정보를 복구한다.
- **Case C: File Exists + Hash Mismatch**: 정책 정합성 위반으로 간주하고 즉시 에러를 발생시킨 후 종료한다.

## 4. Architectural Neutrality

- **Core Ignorance**: Core Engine은 Session Persistence의 구체적인 구현 방식(파일, DB 등)을 알지 못해야 한다.
- **Store Passive Role**: `SessionStore` 구현체는 `executionPlan`의 내용을 해석하거나 비즈니스 로직에 개입하지 않으며, 오직 데이터의 보관과 정합성 검증 책임만 진다.
- **updatedAt Authority**: `updatedAt`은 저장 계층(`FileSessionStore`)에서 기록되는 메타데이터이며, Core Engine 내부 로직의 입력이나 결정에 사용되지 않는다.
