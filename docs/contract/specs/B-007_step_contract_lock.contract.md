# B-007: Step Contract Lock Contract

## 1. Step Registry Lock (Prohibitions)

- **Unauthorized Step Prohibited**: PRD-007 v1.1에 명시된 12가지 Step 외의 사용을 금지한다.
- **Modification Prohibited**: Step의 이름을 변경하거나 기존 필드를 임의로 삭제하는 행위를 금지한다. 변경 시 신규 버전 PRD가 필요하다.

## 2. Flat Model Enforcement

- **Branching Prohibited**: `StepDefinition`에 `onSuccess`, `onFail`, `condition` 필드 추가를 엄격히 금지한다.
- **Non-Flat Structure Prohibited**: Step 배열 외의 실행 구조(graph, tree, nested steps)를 금지한다.
- **Extensions Restriction**: `extensions` 필드는 v1.1에서도 반드시 빈 배열(`[]`)이어야 한다.

## 3. I/O Contract Lock

- **Strict Schema Enforcement**: 각 Step의 입력(Payload)과 출력(Result)은 정의된 JSON 스키마를 엄격히 따라야 하며, 정의되지 않은 필드 포함을 금지한다.
- **RetrieveMemory Result Contract**: 개별 item은 명세된 필드(`id`, `summary`, `timestamp`)만을 포함해야 하며, 결과 개수는 0에서 `topK` 사이의 값을 허용한다.
- **RetrieveDecisionContext Result Contract**: `decisions` 및 `anchors` 배열은 정의된 객체 스키마(whitelist)를 엄격히 준수해야 한다. 별도의 개수 제한(count)은 명시하지 않는다.
- **Implicit state transfer prohibited**: Executor는 Step 간의 암묵적 데이터 전달이나 Payload 자동 변형을 수행하지 않으며, 모든 데이터 흐름은 명시적이어야 한다.

## 4. Ordering Lock

- **Fixed Sequence Only**: 정의된 순서(RepoScan → ... → PersistSession) 외의 순서로 실행되는 것을 금지한다.
- **Core MUST validate subsequence**: Core는 실행 전 Plan의 Step 시퀀스가 v1.1 canonical order의 부분집합(subsequence)인지 반드시 검증해야 한다.
- **Duplicate StepType Prohibited**: 단일 `executionPlan.steps` 내에서 동일한 `StepType`의 중복 등장을 금지한다. 중복이 감지되면 Executor는 즉시 **CycleFail** 처리한다.
- **Duplicate StepDefinition.id Prohibited**: 단일 `executionPlan.steps` 내에서 동일한 `StepDefinition.id`의 중복 등장을 금지한다. 중복이 감지되면 Executor는 즉시 **CycleFail** 처리한다.
- **Optional Execution**: Plan에 Step이 정의되어 있을 때만 실행하며, Core Engine이 자의적으로 Step을 추가하거나 순서를 재배치하는 행위를 금지한다.

## 5. Failure Lock

- **Write Fail-Fast**: `PersistMemory`, `PersistSession` 등 저장소 쓰기 작업 실패 시 즉시 실행을 중단(Fail-Fast)해야 한다.
- **No Silent Fallback**: 모든 Step 실패는 반드시 정의된 규칙(`CycleFail` 또는 `FailFast`)에 따라 전파되어야 하며, 에러를 숨기고 기본값을 사용하는 Silent Fallback을 금지한다.

## 6. Metadata Lock

- **Whitelisted Keys Only**: 공통 Metadata 스키마에 정의된 Key 외의 임의 필드 추가를 금지한다.
- **No Internal Defaults**: `RetrieveMemory`를 위한 `topK` 값은 반드시 Metadata를 통해 명시적으로 전달되어야 하며, 구현체 내부에서 임의의 기본값을 설정하는 것을 금지한다.
- **No Inline Metadata**: Step 내부에 임의 metadata 필드를 추가하는 것을 금지하며, 반드시 `PlanMetadata`를 통해서만 전달한다.

## 7. v1.1 Schema Extension (LOCK)

- **RetrieveDecisionContext Payload**: `{ input: string, currentDomain?: string }`.
  - `currentDomain`은 선택 사항이며, 누락 시 PRD-005에 따라 `global + axis`만 로드한다.
- **PersistDecision Payload**: `{ decision: DecisionObject }`.
  - `DecisionObject`: `{ id, rootId, version, text, strength, scope, isActive, previousVersionId? }`.
- **PersistEvidence Payload**: `{ evidence: EvidenceObject }`.
- **LinkDecisionEvidence Payload**: `{ decisionId: string, evidenceId: string }`.
