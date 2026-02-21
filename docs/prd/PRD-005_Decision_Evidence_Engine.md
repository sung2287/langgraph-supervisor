# PRD-005: Decision / Evidence Engine (Phase 3)

## Objective
단순 대화 요약을 폐기하고, 프로젝트의 핵심 규칙인 결정(Decision)과 재사용 가능한 지식 자산인 근거(Evidence)를 독립적으로 관리하며, Letta를 통해 자동 생성된 이정표(Anchor)로 이를 연결하여 세션 간 지식 연속성을 확보한다.

## Background
- 결정(Decision)은 앞으로 지켜야 할 규칙인 반면, 근거(Evidence)는 잘 작성된 문장이나 논리 구조 등 독립적으로 가치가 있는 자산임.
- 기존의 'Decision 종속적 Evidence' 모델은 지식의 재사용성을 제약하므로, 두 개체를 분리하고 유연하게 연결하는 구조가 필요함.

## Terminology Clarification (LOCK)

This system distinguishes two orthogonal concepts:

1. Phase (Execution Stage)
   - Represents "what kind of work is being performed".
   - Examples: design, implement, diagnose, review.
   - Phase controls workflow, document injection, and execution behavior.
   - Phase does NOT control Decision retrieval scope.

2. Domain (Target Area / Scope)
   - Represents "which system area the work applies to".
   - Examples: runtime, wms, coding, ui, global.
   - Domain is used exclusively for Decision retrieval filtering.
   - Domain corresponds to the `scope` field of Decision.

**Domain Change Policy (LOCK)**:
- Domain changes MUST be manual-only.
- Phase/Mode MUST NOT automatically modify `currentDomain`.
- PolicyInterpreter and Router are prohibited from deriving Domain from Phase.
- `currentDomain` may only change via explicit user or policy instruction.

These two axes must never be conflated. Phase = behavioral context. Domain = semantic applicability boundary. Decision retrieval must use Domain (scope), not Phase.

## Scope
- **Decision 관리**: 의미 SSOT로서의 결정 사항 저장, 버전 관리(rootId Chain), 강도 및 범위 적용.
- **Evidence 관리**: 독립적 지식 자산(작법 패턴, 연구 발췌, 논리 프래그먼트 등) 저장 및 태깅.
- **Decision-Evidence 연결**: 다대다(Many-to-Many) 형태의 선택적 링크 테이블 운영.
- **Anchor 연동 (Auto)**: Letta 레이어에서 자동 생성된 네비게이션 힌트 제공.
- **Retrieval 시스템**: 결정의 계층적 로딩 및 근거의 독립적 탐색.

## Non-Goals
- 대화 요약(Summary) 저장.
- Evidence의 Decision 귀속 강제 (독립 존재 허용).
- Anchor를 통한 로직 강제 또는 차단.
- 기존 데이터 덮어쓰기(Overwrite) 방식의 수정.

### Naming Convention Rule (LOCK)
- 문서 레벨 필드는 camelCase (`rootId`, `previousVersionId`, `isActive`)를 사용한다.
- DB 스키마 레벨은 snake_case (`root_id`, `previous_version_id`, `is_active`)를 사용한다.
- 두 표현은 동일 의미이며, 구현 시 매핑 레이어에서 변환한다.

## Data Structures (LOCK)

### 1. Decision (결정)
- `id`: UUID v4 (각 버전의 고유 ID)
- `rootId`: 최초 생성된 Decision의 ID (체인 식별자)
- `version`: 수정 시 증가하는 정수 (최초 버전 1)
- `previousVersionId`: 직전 버전을 가리키는 ID
- `text`: 결정된 규칙의 한 줄 요약
- `strength`: `axis` | `lock` | `normal`
- `scope`: 'global' | 'runtime' | 'wms' | 'coding' | 'ui'
- `isActive`: 현재 활성여부 (boolean)
- `createdAt`: 생성 시점 (timestamp)

### Decision Versioning Model (LOCK)
- 하나의 논리적 Decision 체인은 동일한 `rootId`를 공유한다.
- `(rootId, version)` 조합은 유일해야 한다.
- 수정 시 기존 `isActive=true` 레코드를 `false`로 전환하고, 동일 `rootId`와 `version + 1`로 신규 레코드를 생성한다.

### rootId Rules (LOCK)
- 최초 생성 시 `rootId = id` 규칙을 따른다.
- 수정 시 `rootId`는 절대 변경하지 않는다.
- `previousVersionId`는 동일 `rootId` 체인 내부의 직전 버전만 가리킬 수 있다.

### 2. Evidence (근거/자산)
- `id`: UUID v4
- `content`: 재사용 가능한 내용 원문 (인용구, 구조, 분석 노트 등)
- `tags`: 검색 및 분류를 위한 키워드 배열 (optional)
- `createdAt`: 생성 시점 (timestamp)

### Evidence Rule
- Evidence는 독립적인 persistent 개체이다.
- 반드시 Decision에 귀속될 필요가 없으며, 하나 이상의 Decision과 선택적으로 링크될 수 있다.

### 3. Anchor (앵커/이정표)
- `id`: UUID v4
- `hint`: 상기를 위한 짧은 텍스트 (Letta 자동 생성)
- `targetRef`: 가리키는 Evidence ID 또는 Decision ID (특정 버전)
- `type`: `evidence_link` | `decision_link`

### Anchor Version Policy (LOCK)
- Anchor는 특정 Decision "버전"을 가리킨다.
- Decision의 신규 버전이 생성되어도 기존 Anchor는 자동 갱신되지 않고 생성 당시의 맥락을 보존한다.

**Anchor Integrity Policy (LOCK)**:
- Anchor `targetRef` integrity is Soft.
- If `targetRef` does not resolve to an existing Decision/Evidence:
    - Runtime MUST NOT Fail-Fast.
    - Runtime MAY mark anchor as "broken".
    - System execution MUST continue.

## Execution Rules
- **Domain Context Requirement**: Runtime MUST maintain an explicit Domain value (e.g., `GraphState.currentDomain`). This value determines Decision retrieval scope, is independent from Phase/Mode, and must not be implicitly derived from Phase. Setting `currentDomain` is a runtime state responsibility and may be changed by explicit user/policy action only.
- **Domain Default (LOCK)**:
  - If `currentDomain` is not explicitly set for the session/turn, Decision retrieval MUST load **only**: `global + axis` and MUST NOT attempt domain-specific retrieval.
  - This prevents implicit Phase→Domain derivation and avoids arbitrary defaults.
- **Scope Allowlist Validation (LOCK)**:
  - Application layer MUST validate `Decision.scope` against the Approved scope allowlist (v1): ['global', 'runtime', 'wms', 'coding', 'ui'].
  - Invalid scope MUST trigger Fail-Fast before persistence.
  - Storage layer MUST remain passive and not enforce scope validation.

Scope Semantic Definition (LOCK):
- global  : Cross-domain architectural principles and invariant rules.
- runtime : Orchestration engine / execution framework decisions.
- wms     : Writing Management System domain logic.
- coding  : Code generation / repository structure decisions.
- ui      : User interface and presentation layer decisions.

This list is authoritative for v1.
Any new scope value requires PRD-level change.
Ad-hoc scope extension is prohibited.

- **즉시 저장 (Immediate Persist)**: `SAVE_DECISION` 또는 `SAVE_EVIDENCE` 확정 즉시 DB에 저장되며 다음 턴부터 반영된다.
- **Retrieval 우선순위 (Decision)**: 
    1. `global + axis` (최우선)
    2. `currentDomain + axis`
    3. `currentDomain + lock`
    4. `currentDomain + normal`
- **Retrieval Strategy Clarification (LOCK)**: 계층적 로딩(Hierarchical Loading) 후 병합 방식을 유지하며, 단일 ORDER BY로 대체하지 않는다. Decision hierarchical loading operates strictly on Domain (scope). Changing Phase must not automatically change Domain.
- **Anchor 작동 원칙**: Letta가 대화 압축 중 생성하며, 사용자가 원문을 확인하도록 유도하는 네비게이션 힌트 역할만 수행한다.

## Failure Handling
- **Write/Integrity 오류**: 즉시 **Fail-Fast** 한다.
- **개체 독립성**: Decision 없는 Evidence 또는 Evidence 없는 Decision 저장 시도는 **정상(Valid)**으로 처리한다.
- **Retrieval 결과 부재**: 정상 응답으로 처리한다.

## Conclusion
Decision / Evidence 데이터가 의미 SSOT를 구성하며, PRD-005는 그 저장 및 검색 엔진을 정의한다.
