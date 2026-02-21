# D-010: Session Lifecycle UX Platform

## 1. 현재 구조 요약
- `FileSessionStore`: 단일 경로를 상수로 가짐.
- `execution_plan_hash`: JSON 내 메타데이터로 저장됨.
- `verify()`: 로드 직후 해시를 대조함.

## 2. 변경 지점
- **`runtime/cli/run_local.args.ts`**: 신규 플래그(`--fresh-session`, `--session`) 파싱 로직 추가.
- **`runtime/cli/run_local.ts`**: 파싱된 인자를 기반으로 세션 파일명을 결정하여 Store에 주입하는 로직 추가.
- **`src/session/file_session.store.ts`**:
    - 생성자에서 고정된 경로 대신 주입받은 `filename`을 사용하도록 확장.
    - 파일 로드 전 `--fresh-session` 신호를 처리하는 로직(Rotation) 추가.
    - **Order Enforcement**: Rotation 로직은 반드시 `load()` 또는 `verify()` 호출 이전에 완료되어야 함.

## 3. Rotation Policy
- **경로**: `ops/runtime/_bak/`
- **파일명 구조**: `session_state.<original_name>.<timestamp>.json.bak`
- **보관 정책**: 최대 10개까지 보관하며, 초과 시 가장 오래된 파일을 삭제함 (FIFO).

## 4. 영향 분석
- **Core (src/core)**: 수정 사항 없음.
- **PlanExecutor**: 전달받은 Store 인터페이스를 그대로 사용하므로 영향 없음.
- **Step Contract**: 데이터 정합성 규칙에 변동 없음.

## 5. Rotation Failure Rule (LOCK)
- **Error Handling**: Rotation 과정에서 오류 발생 시 시스템은 반드시 즉시 중단(Abort)되어야 한다.
- If rotation fails due to:
    - file permission error
    - rename failure
    - disk I/O error
  Runtime MUST abort with explicit error.
- Runtime MUST NOT:
    - silently ignore rotation failure
    - partially overwrite original session file
- Rotation failure is treated as a **fail-fast** condition.

---
*Last Updated: 2026-02-21 (Reinforced)*
