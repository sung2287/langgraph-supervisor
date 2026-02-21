# D-007: Step Contract Lock Platform

## 1. Runtime Components

- **PolicyInterpreter**: `policyRef`와 현재 상황을 해석하여 PRD-007 계약을 준수하는 `executionPlan`을 생성함.
- **Executor (Core Engine)**: 수신된 `executionPlan` 내의 Step 리스트를 순차적으로 반복 실행함. `StepDefinition.id`를 로그 및 추적 키로 사용하며, Plan을 수정하거나 재구성하지 않음.
- **Step Handlers**: 각 Step Type별 구체적인 로직을 수행하는 인터페이스 구현체. Payload 내부 스키마 검증 및 의미 해석은 해당 Step Handler의 책임임.
- **Stores**: `SessionStore`, `MemoryStore`, `Storage` 등은 Step Handler의 호출에 의해서만 데이터에 접근함.

## 2. Execution Flow

1.  **Plan 수신**: `step_contract_version` 검증.
2.  **Ordering validation before loop**: 실행 전 steps 시퀀스가 v1.1 canonical order의 부분집합(subsequence)인지 검증. Ordering validation은 (a) canonical order subsequence 여부, (b) mandatory step 존재 여부, (c) duplicate StepType 없음, (d) duplicate StepDefinition.id 없음을 함께 검증한다. 위반 시 CycleFail.
3.  **Step Loop**: Plan에 정의된 Step 리스트를 순서대로 순회.
    - `id` 필드를 사용한 로깅 및 추적.
    - Branching/Conditional 구조를 배제한 순차적 실행.
    - 각 Step의 Payload를 Handler로 전달.
4.  **결과 누적**: 각 Step의 결과를 결과 누적부(Result Ledger)에 기록. 각 Step Handler는 `priorResults`를 통해 이전 Step의 결과를 읽기 전용(Read-only)으로 조회할 수 있다. Executor는 결과를 사용하여 다음 Step의 Payload를 자동으로 변형하거나 주입하지 않는다.
    - **RetrieveDecisionContext Enforcement**:
      - `global + axis`는 항상 로드한다.
      - `currentDomain`이 Payload에 명시된 경우에만 해당 도메인의 `axis`, `lock`, `normal`을 로드한다.
      - Phase로부터 도메인을 암묵적으로 유도하지 않는다.
5.  **Cycle 종료**: 모든 Step 실행 후 `PersistSession`을 통해 상태 확정.

### Metadata Enforcement (LOCK)

- Executor는 Step 실행 전에 해당 Step이 요구하는 필수 metadata 존재 여부를 검증해야 한다.
- `RetrieveMemory` Step은 `ExecutionPlan.metadata.topK`가 명시되지 않은 경우 실행할 수 없다.
- `topK`가 없을 경우 즉시 **CycleFail**로 처리한다.
- `RetrieveDecisionContext`는 `topK`를 요구하지 않는다.
- Executor 및 Step Handler는 내부 default 값을 설정하지 않는다.
- 모든 metadata 값은 `PlanMetadata`를 통해서만 전달되어야 한다.
- Step 내부에 임의 metadata 필드를 추가하는 것을 금지한다.

## 3. Error Propagation Map

- **CycleFail (Cycle 종료 + 에러 반환)**:
  - `LLMCall`, `SummarizeMemory`, `RetrieveMemory`, `RetrieveDecisionContext`, `RepoScan` 등 논리적/일시적/분석 오류 발생 시.
  - 현재 사이클을 중단하고 사용자에게 에러를 알리되, 런타임 자체는 유지함.
- **FailFast (즉시 프로세스 종료/중단)**:
  - `PersistMemory`, `PersistDecision`, `PersistEvidence`, `LinkDecisionEvidence`, `PersistSession` 등 데이터 정합성에 직결된 오류 발생 시.
  - 지원하지 않는 `step_contract_version` 수신 시.
  - 권한 문제나 치명적인 저장소 오류 발생 시.

## 4. Version Gate

- **Location**: `Router` 또는 `PolicyInterpreter` 입구에서 수행.
- **Logic**: `step_contract_version`이 "1" 또는 "1.1"이 아닐 경우 즉시 실행을 거부하고 **FailFast** 처리함.
- **Extensions**: `extensions` 필드가 비어있지 않은 경우(`!== []`) 즉시 거부하고 **FailFast** 처리함.
