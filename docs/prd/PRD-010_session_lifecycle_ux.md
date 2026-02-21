# PRD-010: Session Lifecycle UX

## 1. Problem Statement
- **UX Friction**: 정책(YAML)이나 실행 계획의 미세한 변경에도 `SESSION_STATE_HASH_MISMATCH` 오류가 발생하며, 사용자가 수동으로 파일을 삭제해야 하는 불편함이 존재함.
- **Path Rigidity**: `ops/runtime/session_state.json` 단일 경로만 사용함에 따라 여러 테스트 시나리오나 Phase를 번갈아 수행할 때 세션이 겹치거나 충돌함.

## 2. Goals
- **Explicit Session Reset**: 명령어를 통해 안전하고 명시적으로 세션을 초기화하는 기능을 제공한다.
- **Session Namespacing**: 세션 파일에 이름을 부여하여 여러 독립적인 세션을 유지할 수 있도록 한다.
- **Strict Hash Preservation**: 기존의 엄격한 해시 검증 로직을 약화시키지 않고 UX 레이어에서 해결한다.
- **Zero Core Change**: Core Engine 로직을 수정하지 않고 Runtime CLI 및 Store 경계에서만 구현한다.

## 3. Non-Goals
- **Implicit Auto-reset**: 해시 불일치 시 자동으로 세션을 초기화하는 행위(보안 및 정합성 리스크).
- **Silent Reset**: 사용자 모르게 기존 세션 데이터를 영구 삭제하는 행위.
- **Hash Weakening**: 검증 단계를 건너뛰거나 느슨하게 만드는 기능.

## 4. Feature Spec

### 4.1 --fresh-session
- 사용자가 명시적으로 새 세션 시작을 요청하는 플래그.
- 기존 세션 파일이 존재할 경우:
    - 해당 파일을 `ops/runtime/_bak/` 디렉토리로 이동(Rotate).
    - 파일명에 `timestamp` suffix 부여 (예: `session_state.20260221_123456.json.bak`).
- 새로운 `session_state` 객체로 실행을 시작하며, Core의 해시 검증은 생성된 새 파일에 대해 그대로 적용됨.

### 4.2 --session <name>
- 특정 이름을 가진 세션 파일을 사용하도록 지정.
- 파일 경로: `ops/runtime/session_state.<name>.json`
- 기본값: `session_state.json` (생략 시)

### 4.3 --session-scope auto (Optional)
- 공급자, 페이즈, 프로필 정보를 조합하여 자동으로 세션 이름을 생성하는 편의 기능.
- 구조: `<provider>.<phase>.<profile>`
- `--session-scope auto` is NEVER default behavior. It MUST be explicitly provided.

## 5. Acceptance Criteria
- 해시 불일치 상황에서 플래그 없이 실행 시 기존처럼 `abort` 처리됨을 확인.
- `--fresh-session` 사용 시 기존 파일이 백업되고 정상적으로 새 세션이 시작됨을 확인.
- 서로 다른 `--session` 이름을 가진 프로세스들이 각자의 파일을 독립적으로 관리함을 확인.

## 6. Risk & Mitigation
- **Contract Lock 유지**: Step Contract 및 ExecutionPlan 규격에 영향을 주지 않음.
- **Plan Validation**: Core의 검증 로직은 주입된 파일 경로와 무관하게 동일하게 작동함.

---
*Last Updated: 2026-02-21 (Reinforced)*
