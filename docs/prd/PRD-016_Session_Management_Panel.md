# PRD-016: Session Management Panel (Web UI)

## 1. Problem Statement
현재 Web UI는 단일 세션에 고정되어 있어 과거 세션 목록 조회 및 관리가 불가능합니다. 사용자는 브라우저 상에서 세션을 안전하게 전환하거나 정리할 수 있는 기능이 필요합니다.

## 2. Goals
- Core Runtime 수정 없이 Web UI 전용 세션 관리 패널 구현.
- 세션 목록 조회 및 메타데이터(마지막 메시지 요약, 업데이트 시간) 표시.
- 안전한 세션 삭제(백업 로테이션) 및 삭제 후 자동 새 세션 생성.
- `session_state.json` 스키마 보존 및 하위 호환성 유지.

## 3. Non-Goals
- CLI 전용 세션의 노출 및 조작.
- `session_state.json` 파일 내부에 메타데이터 필드 추가.
- 엔진 가동 중 강제 세션 삭제 (409 Conflict 처리).
- 세션 내용의 전체 검색 기능.

## 4. Architectural Constraints (LOCKED)
- **Core-Zero-Mod**: `src/core` 내부 로직 수정 절대 금지.
- **Schema Lock**: `GraphState` 및 `session_state.json` 구조 변경 금지.
- **Namespace Authority**: 세션 필터링 및 검증은 반드시 `runtime/orchestrator/session_namespace.ts` 로직을 독점적으로 사용함. Web 계층 내 자체적인 접두사 매칭 구현은 엄격히 금지됨.
- **Web-Only Meta Store**: 세션 요약 등 UI 전용 정보는 `ops/runtime/web_session_meta.json`에 별도 보관.
- **Isolation**: UI 계층에서 직접적인 `fs` 모듈 사용 금지.

## 5. API Contracts (Brief)
- `GET /api/sessions`: 웹 세션 목록 반환 (DTO). 해시 데이터 노출 금지.
- `DELETE /api/session/:id`: 세션 백업 로테이션 (UTC 타임스탬프 충돌 방지 적용).
- `POST /api/session/switch`: 활성 세션 변경.

## 6. Concurrency & Timing Policy
- **Pre-Engine Metadata Update**: 메타데이터 갱신은 사용자 입력 수신 직후, 엔진 실행(`runRuntimeOnce`) 직전에 웹 핸들러 레벨에서 수행됨.
- **Metadata Serialization**: 모든 메타데이터 쓰기는 서버 프로세스 내에서 직렬화(Serialized)되어야 함.

## 7. Failure Scenarios (LOCK)
- **Backup Collision**: 백업 파일(`_bak`)이 이미 존재하는 경우, UTC 타임스탬프 접미사를 추가하여 덮어쓰기를 방지함.
- **Active Session Deletion**: 현재 사용 중인 세션 삭제 시 서버는 즉시 새 세션을 생성하여 `newSessionId`를 전달함.

## 8. Definition of Done
- 세션 목록이 정상 출력되며 해시 정보가 노출되지 않음.
- 세션 삭제가 `renameSync`를 통한 백업 로테이션으로 수행됨 (`fs.unlink` 사용 금지).
- 네임스페이스 검증이 중앙 집중화된 모듈(`session_namespace.ts`)을 통해 수행됨.
