# D-006: Storage Layer (SQLite v1) Platform

## 1. Directory Structure
```bash
ops/runtime/
    └── runtime.db
```

## 2. Initialization Flow (Runtime Boot)
1. **Directory/Permission Check**: `ops/runtime/` 존재 및 권한 확인.
2. **Database Creation**: 파일 부재 시 신규 생성.
3. **WAL Mode Declaration**:
    - SQLite MUST enable WAL mode.
    - Synchronous mode should prioritize durability over performance.
    - SQLite MUST explicitly enable foreign key enforcement:
        PRAGMA foreign_keys = ON;
4. **Schema Integrity Check**: `schema_version` 테이블 조회.
5. **Version Gate**: 요구 버전과 불일치 시 즉시 **Fail-Fast**.

## 3. SQLite Schema Definition (Exact PRD-005 Compliance)

```sql
-- schema_version
CREATE TABLE schema_version (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- decisions (Versioned Chain)
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

-- evidences (Independent Asset)
CREATE TABLE evidences (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    tags TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- decision_evidence_links (Many-to-Many)
CREATE TABLE decision_evidence_links (
    decision_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    PRIMARY KEY (decision_id, evidence_id),
    FOREIGN KEY(decision_id) REFERENCES decisions(id),
    FOREIGN KEY(evidence_id) REFERENCES evidences(id)
);

-- anchors (Non-FK application validated)
CREATE TABLE anchors (
    id TEXT PRIMARY KEY,
    hint TEXT NOT NULL,
    target_ref TEXT NOT NULL,
    type TEXT CHECK(type IN ('evidence_link', 'decision_link')) NOT NULL
);
-- Note: The AnchorPort or corresponding service layer MUST validate referential integrity 
-- of target_ref before persistence, as the DB does not enforce FKs for this polymorphic reference.

-- repository_snapshots
CREATE TABLE repository_snapshots (
    version_id TEXT PRIMARY KEY,
    repo_path TEXT NOT NULL,
    file_count INTEGER NOT NULL,
    last_scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Retrieval Performance
CREATE INDEX idx_decisions_scope_strength_active
    ON decisions(scope, strength, is_active);

CREATE INDEX idx_decisions_root_version
    ON decisions(root_id, version);

CREATE INDEX idx_links_evidence
    ON decision_evidence_links(evidence_id);
```

### FK Enforcement Policy (LOCK)
- Foreign key constraints may be enabled.
- However, Anchor `target_ref` remains non-FK by design.
- If FK enforcement is disabled at SQLite level, application MUST validate referential integrity.

## 4. Write Rules
- **Atomic Updates**: Decision 버전 업데이트 시 트랜잭션 사용 강제.
- **Mandatory Transaction Boundary (LOCK)**:
  Any Decision version update MUST:
      BEGIN TRANSACTION
      UPDATE previous version (is_active = 0)
      INSERT new version
      COMMIT
  Partial execution MUST rollback.
- **No Summary Storage**: 저장소 계층에서 `summary` 필드 접근 시도를 로직 위반으로 간주.

## 5. Error Flow
- **Integrity Error**: 무결성 제약 위반 또는 쓰기 오류 시 즉시 종료 (**Fail-Fast**).
- **Read Error**: 쿼리 실패 시 상위 레이어로 에러 전파.
