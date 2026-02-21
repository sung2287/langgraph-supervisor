# B-006: Storage Layer (SQLite v1) Contract

## 1. Functional Scope & Prohibition Rules
- **Pure Data Storage**: Storage Layer는 오직 데이터 보관 및 조회 책임만 진다. 검색 알고리즘 선택, 도메인 결정 등 "판단 로직" 수행을 엄격히 금지한다.
- **No Summary Memory**: `summary` 또는 `keywords` 필드를 포함하는 테이블 생성 및 데이터 주입을 금지한다.
- **Step Neutrality**: Storage는 `executionPlan`의 의미를 해석하지 않으며, 특정 Step의 실행 여부를 스스로 결정하지 않는다.

## 2. Schema & Data Invariants (LOCKED)

### Domain & Phase Compliance (LOCK)

- Storage Layer MUST comply with the "Domain & Phase Ownership (LOCK)" defined in PRD-006.
- Storage MUST NOT infer, fallback, override, or implicitly derive `scope`.
- Phase-based scope inference is strictly prohibited.

- **Whitelisted Tables Only**: 아래 6개 테이블 외의 추가 테이블 생성을 금지한다.
    - `schema_version`, `decisions`, `evidences`,
    - `decision_evidence_links`, `anchors`,
    - `repository_snapshots`
- **Atomic Decision Update**: Decision 수정 시 `isActive=false` 처리와 신규 레코 드 삽입은 단일 트랜잭션으로 완료되어야 한다.
- **No Implicit Domain**: `scope` 필드는 호출자가 명시한 값만 사용하며, 런타임 상황에 기반한 자동 채우기를 금지한다.
- **Scope Validation (Application-Level, LOCK)**:
  Storage does NOT validate allowed `scope` values at DB level.
  The application layer MUST validate scope against an approved whitelist.
  Invalid scope values MUST trigger Fail-Fast.

## 3. Connection & Migration Rules
- **Single Connection Only**: 단일 SQLite Connection만 허용한다.
- **Manual Migration Only**: 자동 스키마 패치를 금지하며, 버전 불일치 시 즉시 Fail-Fast 한다.

## 4. Failure Handling & Neutrality
- **Integrity Fail-Fast**: 저장소 쓰기 실패 시 즉시 중단한다. 이는 데이터 오염 방지용이며 정책 차단이 아니다.
- **Read Error Propagation**: 모든 조회 오류는 상위 레이어로 전파되어야 한다.
- **Implementation Hiding**: Core 엔진은 SQL 문법이나 라이브러리 의존성에 직접 접근하지 않고 추상화된 인터페이스에만 의존한다.
- **Anchor Hiding**: Anchor 저장 시에도 SQL이나 SQLite store에 직접 접근하지 않고 추상화된 포트 인터페이스에 의존한다. Core/Runtime은 포트 인터페이스를 통해 Anchor 무결성을 보장한 후 저장을 요청한다.
