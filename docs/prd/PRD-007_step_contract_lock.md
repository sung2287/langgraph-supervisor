# PRD-007: ExecutionPlan Step Contract (LOCK)

## 1. Objective / Background
AI Orchestration Runtime의 안정성과 확장성을 보장하기 위해 `executionPlan` 내 각 Step의 타입, 입출력 스키마, 실행 순서, 실패 처리 규칙을 명문화하여 고정(LOCK)한다. 버전 v1.1은 PRD-005(의미 SSOT 영속화) 요구사항을 수용하기 위해, Flat 모델을 유지하면서 결정/근거 관련 Step을 선별적으로 추가한다. 이는 Core Engine이 정책이나 구현 세부 사항에 독립적인(Policy-Neutral) 상태를 유지하도록 하는 데 목적이 있다.

## 2. Scope / Non-Goals
### Scope
- **Step Type Registry (v1.1)**: 공식 지원 Step 목록(12종) 및 스키마 고정.
- **Step I/O Contract**: 입력(Payload) 및 출력(Result) 스키마 정의.
- **Step Ordering Rules**: 실행 주기 내 Step 간의 고정 순서 및 조건.
- **Step Failure Semantics**: 실패 유형별(CycleFail, FailFast) 처리 규칙.
- **Metadata Schema (v1.1)**: 공통 및 Step별 Metadata 스키마.
- **Plan Versioning**: `step_contract_version` 도입 ("1", "1.1") 및 v2 확장 훅(Extensions) 정의.

### Flat Execution Model (v1 LOCK)
- v1의 `executionPlan`은 **Flat Step List** 구조로 고정한다.
- Step은 선형 배열이며, 분기(Branching), 조건(onSuccess/onFail), 반복(loop) 구조를 허용하지 않는다.
- 모든 조건부 실행은 PolicyInterpreter 단계에서 Plan 생성 시 결정된다.
- Core Engine은 동적 분기를 수행하지 않는다.
- Branching/Conditional Execution은 v2 PRD로만 도입 가능하다.

### Non-Goals
- 개별 Step의 알고리즘 구현 (요약/검색/스캔 로직 등).
- PolicyInterpreter의 내부 생성 로직.
- 멀티모달 데이터의 상세 처리 규격.

## 3. Step Type Registry (LOCK)
v1 공식 Step 목록 및 규격은 아래와 같다. Step 이름 변경 및 삭제는 금지된다.

| Step Type | 목적 | Input (Payload) Schema | Output (Result) Schema |
| :--- | :--- | :--- | :--- |
| `RepoScan` | 리포지토리 분석 | `{ repoPath: string }` | `{ versionId: string, fileCount: number }` |
| `ContextSelect` | 컨텍스트 소스 선택 | `{ input: string, sources: string[] }` | `{ selectedContext: any[] }` |
| `RetrieveMemory` | 과거 기억 검색 (Legacy) | `{ input: string, topK: number }` | `{ items: [{ id, summary, timestamp }] }` (0..topK allowed) |
| `RetrieveDecisionContext` | 결정/근거 검색 (v1.1) | `{ input: string, currentDomain?: string }` | `{ decisions: Decision[], anchors: Anchor[] }` |
| `PromptAssemble` | 프롬프트 조립 | `{ template: string, vars: object }` | `{ prompt: string }` |
| `LLMCall` | LLM 추론 실행 | `{ prompt: string, config: object }` | `{ response: string }` |
| `SummarizeMemory` | 대화 요약 생성 (Legacy) | `{ response: string }` | `{ summary: string, keywords: string[] }` |
| `PersistMemory` | 메모리 영속화 (Legacy) | `{ summary, keywords, sessionRef }` | `{ id: string }` |
| `PersistDecision` | 결정 영구 저장 (v1.1) | `{ decision: DecisionObject }` | `{ id: string, version: number }` |
| `PersistEvidence` | 근거 영구 저장 (v1.1) | `{ evidence: EvidenceObject }` | `{ id: string }` |
| `LinkDecisionEvidence` | 결정-근거 연결 (v1.1) | `{ decisionId: string, evidenceId: string }` | `{ status: "linked" }` |
| `persistAnchor` | Anchor 영속 저장 (v1.1) | `{ id: string, hint: string, targetRef: string, type: "decision_link" \| "evidence_link" }` | `{ id: string }` |
| `PersistSession` | 세션 참조 영속화 | `{ sessionRef: string, meta: object }` | `{ status: string }` |

### Core Neutrality Clause (LOCK)
Core Engine은 Step의 비즈니스 의미를 해석하지 않는다. Core는 다음만 수행한다:
1. Plan 순서대로 실행
2. Payload 전달
3. Result 전달
4. Failure Semantics 적용
Payload 내부 스키마 검증 및 의미 해석은 해당 Step Handler의 책임이다. Core는 Step 간의 암묵적 데이터 전달(implicit wiring)이나 Payload 자동 변형(mutation)을 수행하지 않는다.

## 4. Step Ordering Rules (LOCK)
Execution Cycle 내 Step은 아래의 고정된 순서를 따르며, Plan에 존재하는 Step만 선택적으로 실행된다. Executor는 실행 전 steps 시퀀스가 본 v1.1 canonical order의 부분집합(subsequence)인지 검증해야 한다.

1.  `RepoScan` (Optional)
2.  `ContextSelect` (Mandatory)
3.  `RetrieveMemory` (Optional - Legacy)
4.  `RetrieveDecisionContext` (Optional - v1.1)
5.  `PromptAssemble` (Mandatory)
6.  `LLMCall` (Mandatory)
7.  `SummarizeMemory` (Optional - Legacy)
8.  `PersistMemory` (Optional - Legacy)
9.  `PersistDecision` (Optional - v1.1)
10. `PersistEvidence` (Optional - v1.1)
11. `LinkDecisionEvidence` (Optional - v1.1)
12. `persistAnchor` (Optional - v1.1)
13. `PersistSession` (Mandatory)

### Ordering Clarification
본 순서는 v1.1 canonical order이다. PolicyInterpreter는 이 순서를 기반으로 Plan을 구성해야 한다. Core는 Plan에 명시된 순서만 실행하며, Step 순서를 재배치하거나 삽입하지 않는다. Executor validation required: subsequence check + mandatory presence + no duplicate StepType. 위반 시 CycleFail 처리한다.

## 5. Failure Semantics (LOCK)
실패 시 처리 규칙은 아래와 같이 고정된다.

- **CycleFail**: 해당 실행 주기만 실패로 종료하고 에러를 상위로 전파.
- **FailFast**: 데이터 무결성 보호를 위해 런타임 프로세스를 즉시 중단.

| Step Type | Failure Type | Rationale |
| :--- | :--- | :--- |
| `PersistMemory`, `PersistDecision`, `PersistEvidence`, `LinkDecisionEvidence`, `persistAnchor`, `PersistSession` | **FailFast** | 저장소 및 세션 데이터 무결성 보호 필수. |
| `RepoScan`, `LLMCall`, `SummarizeMemory`, `RetrieveMemory`, `RetrieveDecisionContext` | **CycleFail** | 분석 또는 일시적 오류로 간주, 세션 무결성에 치명적이지 않음. |
| `ContextSelect`, `PromptAssemble` | **CycleFail** | 로직 오류로 간주, 안전하게 해당 Cycle만 중단. |

## 6. Metadata Schema (LOCK)
`executionPlan`의 공통 Metadata 필드는 아래와 같이 제한된다. Step-specific metadata는 반드시 `PlanMetadata`를 통해 전달하며, Step 내부에 임의 필드를 추가하는 것을 금지한다.

```ts
interface PlanMetadata {
  topK?: number;
  timeouts?: { llmMs?: number; ioMs?: number };
  budgets?: { promptTokens?: number };
  policyProfile: string;
  mode: string;
}
```
- `RetrieveMemory`는 `topK` 명시 없이는 실행할 수 없다.

## 7. Data Structures & Versioning (LOCK)

```ts
interface StepDefinition {
  id: string;        // v1 필수, 고유 식별자. executionPlan 내에서 유일(unique)해야 하며 중복 시 Executor는 CycleFail 처리한다.
  type: StepType;
  payload: unknown;
}

interface ExecutionPlan {
  step_contract_version: "1" | "1.1";
  extensions: [];    // v1.1에서도 반드시 빈 배열
  metadata: PlanMetadata;
  steps: StepDefinition[];
}
```
- `extensions`는 v1에서 반드시 빈 배열이어야 한다.
- Branching/Conditional 확장은 `step_contract_version` 증가와 함께 별도 PRD에서 정의한다.

## 8. Success Criteria
- Flat Step List 모델이 고정되어 동적 분기가 발생하지 않음.
- Core Engine이 Step의 의미를 해석하지 않고 순수 실행기로서 동작함.
- `RepoScan` 실패가 `CycleFail`로 조정되어 불필요한 런타임 중단이 방지됨.

### Step Surface Clarification (LOCK)

Under v1.1, the official Step surface includes persistAnchor.
No hidden or legacy-only step types are permitted in runtime execution.
