# D-016: Session Management Platform Implementation

## 1. Overview
파일 위치, 어댑터 경계, 데이터 원자성 및 동시성 정책을 정의합니다.

## 2. File Locations & Structure

### 2.1 Web-only Metadata Store
- **Path**: `ops/runtime/web_session_meta.json`

### 2.2 Session Discovery Source-of-Truth (NEW)
- **Rule**: 세션 발견의 유일한 정본은 파일 시스템상의 세션 파일 존재 여부임.
- **Resilience**:
    - `RuntimeAdapter`는 파일 시스템 스캔 결과를 기반으로 목록을 생성한 뒤 메타데이터를 결합함.
    - 메타데이터 손상이나 누락이 세션 노출 자체를 차단해서는 안 됨 (파일 mtime 기반 폴백 적용).
    - 좀비 메타데이터(파일 없는 정보)는 UI에 노출되지 않도록 필터링함.

## 3. Metadata Concurrency Policy (LOCK)
- **Serialization**: 모든 메타데이터 쓰기 작업은 직렬화되어야 함.
- **Isolation**: 실행 상태와 분리되며 런타임 흐름을 간섭하지 않음.

## 4. Metadata Atomicity Policy
- **Pattern**: `tmp-file + renameSync` 패턴 필수 적용.

## 5. Backup Rotation Collision Handling
- **Target Path Generation**: 충돌 시 UTC 타임스탬프 접미사 부여 및 `fs.unlink` 금지.

## 6. Security & Constraints
- **Validation Authority**: `session_namespace.ts`를 통한 선제적 권한 검증 필수.
- **Switch Safety**: 세션 전환 시 `Namespace Auth -> File Check` 순서의 엄격한 검증 절차 준수.
