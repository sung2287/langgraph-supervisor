# B-005: Decision / Evidence Engine Contract

## 1. Data Integrity Invariants (Prohibitions)
- **No Overwrite**: 기존 Decision 레코드의 필드를 직접 수정하는 것을 금지한다.
- **Independent Existence Allowed**: Decision과 Evidence는 서로 링크되지 않은 상태로 독립적으로 존재할 수 있다.
- **No Summary**: `summary` 필드 사용 및 요약 데이터 저장을 엄격히 금지한다.
- **Root/Chain Integrity**: `root_id` 변조 및 체인 간 교차 연결(`previous_version_id`)을 금지한다.
- **Scope Integrity Rule**: 허용되지 않은 `scope` 도메인 값 저장을 즉시 거부한다.
- **Atomic Version Update (LOCK)**:
  - Creating a new Decision version MUST be performed atomically:
    - Deactivate previous active version (`is_active=false`)
    - Insert new version (`is_active=true`, `version=prev+1`)
  - Partial updates are forbidden; any failure MUST Fail-Fast.

## 2. Schema Contract
- **Decision**: `id`, `root_id`, `version`, `text`, `strength` (enum), `scope` (string), `is_active` (boolean), `created_at`.
- **Evidence**: `id`, `content` (string), `tags` (JSON/array), `created_at`.
- **DecisionEvidenceLink**: `decision_id` (uuid), `evidence_id` (uuid).
- **Anchor**: `id`, `hint` (string), `target_ref` (uuid), `type` (enum).

## 3. Hierarchical Retrieval Contract (LOCK)
Retrieval 엔진은 아래 계층적 로딩 단계를 순차적으로 수행 및 병합해야 하며, 단일 ORDER BY로 대체할 수 없다. Retrieval operates strictly on the explicit `currentDomain` field and is independent of the current Phase:
1. `is_active=true` AND `scope='global'` AND `strength='axis'`
2. `is_active=true` AND `scope=currentDomain` AND `strength='axis'`
3. `is_active=true` AND `scope=currentDomain` AND `strength='lock'`
4. `is_active=true` AND `scope=currentDomain` AND `strength='normal'`

## 4. Evidence Retrieval Contract
- Evidence는 독립적으로 탐색 가능하며, Decision 로딩 시 자동으로 동반 로딩되지 않는다 (필요 시 링크 테이블을 통해 명시적 요청).

## 5. Immediate Persistence Contract
- `PersistDecision` 및 `PersistEvidence` Step은 저장 즉시 물리적 커밋을 완료하여 다음 사이클에서 조회가 가능해야 한다.

## 6. Failure Semantics
- 모든 쓰기 및 DB 무결성 오류는 **Fail-Fast** 한다.
- 검색 결과가 없는 것은 정상이지만, 알고리즘 내부 예외는 **Fail-Fast** 한다.
