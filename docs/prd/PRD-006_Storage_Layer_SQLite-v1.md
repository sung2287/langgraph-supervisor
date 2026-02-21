# PRD-006: Storage Layer (SQLite v1)

## Objective
PRD-005(Decision / Evidence Engine)의 데이터 모델을 영구 보존하고, 리포지토리 스냅샷 정보를 관리하기 위해 SQLite 기반의 단일 로컬 저장소 레이어를 구축한다.

## Background
- 파일 기반(JSON) 저장 방식의 한계를 보완하고, 결정(Decision)과 근거(Evidence) 간의 복잡한 관계를 안정적으로 쿼리하기 위해 RDBMS 도입이 필수적임.
- Core 런타임에 추상화된 Storage 인터페이스를 제공하여 구현 세부 사항(SQL)을 은닉함.

## Scope
- SQLite DB 파일 위치 정의: `ops/runtime/runtime.db`.
- **Whitelisted Tables 오직 다음 테이블만 허용 (LOCKED)**:
    - `schema_version`
    - `decisions`
    - `evidences`
    - `decision_evidence_links`
    - `anchors`
    - `repository_snapshots`
- 단일 Connection 기반 CRUD 인터페이스 및 인덱스 생성.
- SQLite 라이브러리 의존성은 Storage Layer 내부로 격리.

## Non-Goals
- 대화 요약(Summary) 및 키워드 데이터 저장.
- 자동 마이그레이션 로직 (버전 불일치 시 Fail-Fast).
- 도메인 판단 로직 (Phase로부터 Domain을 유도하는 행위 등).
- 계층적 Retrieval 알고리즘 수행 (Storage는 순수 SQL 실행만 담당).

## Architecture
- **Passive Storage**: Storage는 스스로 판단하지 않으며, 전달받은 SQL 또는 명령을 수동적으로 실행한다.
- **Fail-Fast Integrity**: Storage의 Fail-Fast 동작은 오직 데이터 무결성 보호를 위한 것이다. 이는 정책적인 차단이 아니며, Runtime의 비차단(Non-blocking) 철학을 위반하지 않는다.
- **Migration Manager**: `schema_version` 테이블을 활용하여 수동 마이그레이션 체계를 유지한다.

## Data Structures (Compliant with PRD-005)
- **decisions**: 버전 관리되는 결정 체인 (root_id, version 포함).
- **evidences**: 독립적인 지식 자산 원문.
- **decision_evidence_links**: 결정과 근거 간의 다대다(M:N) 링크.
- **anchors**: Letta 자동 생성 이정표 포인터 (애플리케이션 레벨 무결성).
- **repository_snapshots**: 리포지토리 분석 메타데이터.
- `is_active` is stored as INTEGER (0/1) in SQLite, but exposed as boolean in application layer.

## Execution Rules
- **Storage Responsibility Boundary**: 
    - Storage는 `executionPlan`을 해석하지 않는다.
    - Storage는 Domain을 스스로 결정하지 않으며, 호출자가 전달한 scope 값을 수동적으로 처리한다.
    - Storage MUST NOT implement hierarchical retrieval logic.
    - Storage MAY execute individual SQL queries requested by Retrieval Engine.
    - Retrieval ordering responsibility belongs strictly to upper layer.
- **Atomic Version Update**: Decision 신규 버전 생성 시, 기존 버전 비활성화와 신규 삽입은 단일 트랜잭션 내에서 원자적으로 처리되어야 한다.

## Failure Handling
- **Write Fail-Fast**: 데이터 쓰기 실패 시 정합성 붕괴 방지를 위해 즉시 프로세스를 중단한다.
- **Read Error Propagation**: 읽기 실패 시 에러를 숨기지 않고 상위 레이어로 즉시 전파한다.
- **Version Integrity**: `schema_version` 불일치 감지 시 즉시 실행을 중단한다.

## Success Criteria
- PRD-005에서 정의한 모든 데이터 개체가 물리적으로 정상 저장 및 조회됨.
- 저장소 오류 시 데이터 오염 없이 안전하게 시스템이 종료됨.
