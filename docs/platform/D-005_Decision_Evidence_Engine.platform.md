# D-005: Decision / Evidence Engine Platform

## 1. SQLite Schema Definition

```sql
-- Decision Table (Versioned Chain)
CREATE TABLE decisions (
    id TEXT PRIMARY KEY,
    root_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    previous_version_id TEXT,
    text TEXT NOT NULL,
    strength TEXT CHECK(strength IN ('axis', 'lock', 'normal')) NOT NULL,
    scope TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(root_id, version)
);

-- Evidence Table (Independent Asset)
CREATE TABLE evidences (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    tags TEXT, -- JSON array of strings
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Decision-Evidence Link Table (Many-to-Many)
CREATE TABLE decision_evidence_links (
    decision_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    PRIMARY KEY (decision_id, evidence_id),
    FOREIGN KEY(decision_id) REFERENCES decisions(id),
    FOREIGN KEY(evidence_id) REFERENCES evidences(id)
);

-- Anchor Table (Auto-generated Hints)
CREATE TABLE anchors (
    id TEXT PRIMARY KEY,
    hint TEXT NOT NULL,
    target_ref TEXT NOT NULL, -- points to decisions.id or evidences.id
    type TEXT CHECK(type IN ('evidence_link', 'decision_link')) NOT NULL
);
```

### Scope Validation Policy (Application Level, LOCK)
- `scope` 값은 DB 제약 대신 애플리케이션 레벨에서 Approved scope allowlist (v1): ['global', 'runtime', 'wms', 'coding', 'ui']와 대조 검증하며, 불일치 시 Fail-Fast 한다.
- Storage layer MUST remain passive and not enforce scope validation.
- All writes to `Decision.scope` MUST be validated by the engine/handler before calling storage.

Scope Semantic Definition:
Refer to PRD-005: Decision / Evidence Engine – Scope Semantic Definition (LOCK).
This section is authoritative and must not be redefined here.

## 2. Indexing Strategy
- **Versioning**: `idx_decisions_root_version` (root_id, version)
- **Retrieval**: `idx_decisions_scope_strength_active` (scope, strength, is_active)
- **Linking**: `idx_links_evidence` (evidence_id)

### FK Policy Clarification (Documentation Only)
- `previous_version_id`:
  - FK enforcement is optional.
  - v1 may validate chain integrity at application level (consistent with Anchor non-FK policy).
  - If FK is not used, the runtime MUST validate:
      - `previous_version_id` exists
      - `previous_version_id` belongs to same `root_id` chain

## 3. Retrieval Query Logic (Hierarchical Loading)
런타임은 다음 4개 쿼리를 계층적으로 순차 실행하여 결과를 수집한다. Retrieval operates strictly on the explicit `currentDomain` field and is independent of the current Phase.

**Domain Change Policy (LOCK)**:
- Domain changes MUST be manual-only.
- Phase/Mode MUST NOT automatically modify `currentDomain`.

```sql
-- 1. Global Axis, 2. Domain Axis, 3. Domain Lock, 4. Domain Normal (Sequential Execution)
-- ? represents currentDomain
SELECT * FROM decisions WHERE is_active = 1 AND scope = ? AND strength = ?;
```

LOCK Clarification:
- The query above represents a single hierarchical step.
- The runtime MUST execute four separate sequential queries
  (global+axis → domain+axis → domain+lock → domain+normal).
- This MUST NOT be replaced with a single combined ORDER BY query.

## 4. Anchor Integrity Guide (Non-FK, LOCK)
- `target_ref`는 다형적 참조이며 애플리케이션 레벨에서 `type`과 대상 테이블의 존재 여부를 검증한다.
- **Soft Integrity Policy**: If `target_ref` is missing in the database, the runtime MUST NOT Fail-Fast and MUST continue execution.
- 신규 버전 생성 시 기존 Anchor를 자동 업데이트하지 않으며, 생성 시점의 특정 version을 유지한다.

## 5. Write Implementation Rules
- **Atomic Linking**: Decision과 Evidence를 동시에 저장하며 링크를 생성할 경우 단일 트랜잭션으로 처리한다.
- **Immediate Commit**: WAL 모드를 활용하며 `SAVE` 트리거 직후 즉시 `COMMIT` 한다.
