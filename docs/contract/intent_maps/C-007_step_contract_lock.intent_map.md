# C-007: Step Contract Lock Intent Map

## 1. Problem Recognition (The Why)

- **Step Sprawl**: Step의 무분별한 추가와 명확하지 않은 입출력 규격은 장기적으로 아키텍처를 불투명하게 만듦.
- **Implicit Execution**: Core Engine이 Plan에 없는 동작을 자의적으로 판단하여 실행할 경우, 정책 중립성이 훼손되고 디버깅 및 재현이 어려워짐.
- **Metadata Confusion**: Step별 필요한 데이터가 중구난방으로 정의되어 데이터 흐름의 일관성이 상실됨.

## 2. Intent Summary (The Core Philosophy)

- **"executionPlan은 실행의 유일한 근거다."**
- **"Step Contract는 변경이 PRD로만 가능하다."**
- **"v1.1 Controlled Extensibility"**: PRD-005의 결정 엔진 수용을 위해 Flat 모델을 유지하며 Step Registry를 선별적으로 확장한다.

## 3. Protection Targets (The What to Protect)

- **Core Neutrality**: Core Engine은 구체적인 비즈니스 로직(Step 내부)을 알지 못하고 실행만 담당함.
- **Policy Consistency**: 정책이 의도한 실행 계획(`executionPlan`)이 정확히 런타임에 재현됨.
- **Data Integrity**: 저장소 쓰기 등 핵심 Step의 실패 시 즉시 중단(Fail-Fast)하여 데이터 오염을 방지함.
- **Reproducibility**: 동일한 `executionPlan`이 입력되면 항상 동일한 Step 시퀀스와 결과가 보장됨.

## 4. Risks & Guards (The How to Prevent)

- **Registry/Ordering/Metadata Lock**: Step 목록, 순서, 메타데이터 스키마를 고정(LOCK)하여 임의 확장을 방지함.
- **Flat Execution Model Risk**: Flat 모델을 유지하지 않고 조기 Branching을 도입할 경우, Step Contract가 복잡한 Workflow DSL로 변질될 위험이 있음. v1에서는 실행 단순성을 구조적 안전성보다 우선함.
- **Fixed Failure Semantics**: 실패 처리 규칙을 명문화하여 에러를 묵인하거나 부적절한 복구 시도를 차단함.
- **Expansionist Tendency Risk**: 편의를 위해 Step을 임의로 늘리거나 스키마를 유연하게(Relaxed) 정의하여 계약이 무너지는 리스크를 경계함.
