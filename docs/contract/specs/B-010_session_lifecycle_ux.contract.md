# B-010: Session Lifecycle UX Contract

## 1. CLI Flags Contract
- `--fresh-session`: `boolean` (default: `false`)
- `--session`: `string` (optional)

## 2. Session File Resolution Rule
- 런타임은 다음 규칙에 따라 세션 파일명을 결정한다.
```text
IF --session is provided:
    filename = "session_state." + <name> + ".json"
ELSE:
    filename = "session_state.json"
```

## 3. Fresh Session Rule
- `--fresh-session == true`인 경우:
    - 로드 시점에 기존 파일이 존재하면 반드시 백업 디렉토리(`_bak/`)로 이동시킨다.
    - 백업 완료 후 데이터가 없는 상태(null/empty)에서 시작하여 새 해시를 기록한다.
    - 이 과정은 Core의 `verify()` 단계를 우회하는 것이 아니라, 검증 대상을 '신규 생성된 데이터'로 교체하는 것이다.
    - If no existing session file is found, runtime MUST proceed without error and create a new session file.

## 4. Hash Strictness Rule (LOCK)
- `expectedHash`와 `actualHash` 불일치 시 시스템은 반드시 중단(Abort)되어야 한다.
- `--fresh-session`은 이 중단 상황을 해결하기 위한 **유일하고 명시적인** 수단으로 정의된다.

## 5. Fresh Session Execution Order Rule (LOCK)
- **Execution Order**: `--fresh-session` 처리 로직은 기존 세션 파일을 로드하거나 `verify()`를 수행하기 전에 실행되어야 한다.
- Runtime MUST resolve session filename first.
- Runtime MUST perform rotation BEFORE any session file load.
- Runtime MUST NOT call `verify()` on rotated file.
- Runtime MUST start with an empty in-memory session state.

## 6. Flag Combination Rule
- **Scope Limitation**: Flag 조합 시 reset 범위는 resolve된 단일 session 파일로 제한된다.
- IF `--session <name>` AND `--fresh-session` are both provided:
    - Rotation MUST apply ONLY to the resolved namespaced file.
    - Default `session_state.json` MUST NOT be affected.
    - Other session namespace files MUST NOT be touched.

---
*Last Updated: 2026-02-21 (Reinforced)*
