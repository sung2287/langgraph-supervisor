# C-016: Session Management Intent Map

## 1. Overview
사용자 의도와 시스템 동작 간의 매핑 및 권한 강제를 정의합니다.

## 2. User Intent → System Mapping

| User Intent | System Action | Authority |
|---|---|---|
| **세션 목록 조회** | `RuntimeAdapter.listWebSessions()` | `session_namespace.ts` 위임 |
| **세션 삭제** | `DELETE /api/session/:id` | 로테이션 정책 적용 |
| **세션 요약 업데이트** | `web_session_meta.json` 갱신 | Pre-Engine Hook |

## 3. Namespace Authority Enforcement (LOCK)
- 세션 발견 및 필터링 시 Web 계층은 반드시 `runtime/orchestrator/session_namespace.ts` 로직을 사용해야 함.
- 직접적인 디렉토리 스캐닝이나 수동 문자열 접두사 매칭은 금지됨.
- 이는 네임스페이스 규칙의 파편화와 CLI 세션 오노출을 방지하기 위함임.

## 4. Metadata Update Timing (PRE-ENGINE)
- 사용자 입력 수신 즉시, `runRuntimeOnce()` 호출 전 메타데이터를 갱신함.
- 실행 결과나 엔진 상태에 의존하지 않는 독립적 UX 레이어 동작임.

## 5. Delete Session Intent Handling (LOCK)
- **Execution**: `renameSync`를 통한 백업 처리.
- **Collision Logic**: 기존 백업 파일 존재 시 UTC 타임스탬프 접미사 부여. 덮어쓰기 절대 금지.
- **Security**: `fs.unlink` 호출은 어떤 상황에서도 금지됨.
