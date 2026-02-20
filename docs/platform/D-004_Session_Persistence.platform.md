# D-004: Session Persistence Platform

## 1. Directory Structure

세션 영속 데이터는 프로젝트 루트의 아래 경로에서 관리된다:
```bash
ops/runtime/
    └── session_state.json
```

## 2. Interface Definition

시스템은 추상화된 인터페이스를 통해 영속화 계층에 접근하며, MVP에서는 파일 시스템 기반의 구현체를 사용한다.

- **SessionStore (Interface)**: `load()`, `save()`, `verify(expectedHash: string)` 등의 표준 명세 제공.
- **FileSessionStore (Implementation)**: `ops/runtime/session_state.json`을 직접 다루는 구현체.
  - `verify(expectedHash)`는 Runtime이 제공한 `expectedHash`와 파일 내의 `lastExecutionPlanHash`를 비교하며, Store 내부에 해시 산출 로직을 포함하지 않는다.

## 3. Lifecycle Hooks

영속화 작업은 런타임의 특정 시점에 명시적으로 수행된다.

- **Runtime Boot Stage (Start)**:
  1. `ops/runtime/session_state.json` 파일 로드 시도.
  2. 파일이 없을 경우 Cold Start로 진입하며, 이 시점에 파일을 생성하지 않는다.
  3. 파일이 존재할 경우, Runtime이 계산하여 제공한 `expectedHash`를 기반으로 `verify()`를 실행한다.
  4. 해시 불일치 시 즉시 종료(**Fail-Fast**).
- **Execution Cycle Post-Process (End)**:
  1. 전체 작업 사이클이 성공적으로 종료되면 `SessionState` 객체 업데이트.
  2. `updatedAt` 필드를 현재 ISO timestamp로 갱신 (저장 계층 책임).
  3. Atomic Write(임시 파일 생성 후 Rename) 방식으로 파일 영속화 (최초 생성 포함).

## 4. Error Flow & Git Policy

- **Error Handling**:
  - 파일 손상(JSON Syntax Error) 감지 시: 즉시 종료 (**Fail-Fast**).
  - 정책 해시 불일치(Hash Mismatch) 감지 시: 즉시 종료 (**Fail-Fast**), 자동 초기화 금지.
  - 디렉토리/파일 쓰기 권한 부재 시: 즉시 종료 (**Fail-Fast**).
- **Git Policy**:
  - `ops/runtime/` 디렉토리와 내부의 모든 `.json` 및 `.db` 파일은 반드시 `.gitignore`에 포함되어야 함. 로컬 개발 환경의 세션 정보가 형상 관리 시스템에 커밋되는 것을 엄격히 방지함.
