# PRD-011: Secret Injection UX

## 1. 목적 (Goal)
사용자의 개인 API Key 및 민감한 인증 정보를 안전하게 관리하고, 소스 코드나 Git 저장소에 노출되지 않도록 하며, 실행 시점에 동적으로 주입할 수 있는 환경을 제공한다.

## 2. 핵심 가치 (Core Values)
- **Secret-Isolation**: 시크릿은 프로젝트 디렉토리가 아닌 사용자 홈 디렉토리(`~`)에 격리 저장한다.
- **Git-Safe**: 시크릿 파일은 `.gitignore` 대상이 될 필요조차 없도록 물리적으로 프로젝트 외부에 둔다.
- **Profile-Based**: 개발, 운영, 개인 계정 등 목적에 따라 시크릿 뭉치를 전환할 수 있다.

## 3. 설계 요구사항 (Requirements)

### 3.1 저장 위치 및 구조
- **저장소**: 사용자 홈 디렉토리 내 전용 폴더.
  - Linux/Mac: `~/.langgraph-orchestration/secrets.json`
  - Windows: `%USERPROFILE%\.langgraph-orchestration\secrets.json`
- **구조**: Profile 기반 계층 구조.
- **Default Profile**: `--secret-profile` 미지정 시 `default` 프로파일을 사용한다. `default` 프로파일이 존재하지 않을 경우 `ConfigurationError`를 발생시킨다.
- **파일 생성 정책**: 런타임 어댑터는 최초 실행 시 `secrets.json` 파일이 없으면 자동 생성한다. 단, **빈 `default` 프로파일은 자동으로 생성하지 않으며**, 사용자가 명시적으로 `secret set` 명령을 통해 프로파일을 생성하기 전까지는 존재하지 않는 것으로 간주한다.

### 3.2 주입 프로세스 (Runtime Adapter Level)
- **Env Object Generation**: 어댑터 레벨에서 `resolveProviderConfig`에 전달할 전용 `env` 객체를 생성한다. `process.env` 직접 병합은 지양하며, `NodeJS.ProcessEnv` 오염은 fallback 전략으로만 사용한다.
- **Pre-Validation**: `resolveProviderConfig` 호출 이전에 시크릿 프로파일 존재 여부, 필수 키 존재 여부, JSON 파싱 성공 여부를 검증한다.

### 3.3 사용자 인터페이스 (UX)
- **CLI (Namespace: `secret`)**:
  - `secret set <profile> <provider> <key>`: 키 설정 및 프로파일 생성.
- **UI**: 프로파일 선택 드롭다운 및 "Test Connection" 기능 제공.

## 4. 보안 정책 (Security Policy)
- **Atomic Write**: 부분 쓰기(Partial Write) 방지를 위해 `temp file write` → `fsync` → `rename` 순서를 명시적으로 준수하여 원자성을 보장한다.

## 5. Plan Hash Clarification
- **Structural Immutability**: `ExecutionPlan`은 구조적으로 불변하며, 시크릿 주입은 `ExecutionPlan`의 내용을 변경하지 않는다.
- **Context Isolation**: 시크릿 값(API Key 등)은 해시 계산에 포함되지 않으며, `ExecutionPlan.extensions`는 항상 빈 배열 `[]`을 유지한다.

## 6. Runtime Boundary Rule
- **No Direct Core Import**: `src/core` 모듈을 직접 임포트하는 행위는 금지된다.
- **Orchestrator Entry**: 모든 시크릿 주입은 `Runtime Orchestrator` 진입 전 어댑터 레벨에서 완료되어야 한다.

## 7. Deterministic Execution Rule
- **Deterministic**: Plan Hash 및 실행 로직은 결정론적(Deterministic)이어야 한다.
- **No Structural Change**: 시크릿 주입은 `ExecutionPlan`의 구조를 절대 변경하지 않는다.
- **Extensions Field**: `ExecutionPlan.extensions`는 항상 `[]`를 유지한다.

## 8. LOCK Summary & Prohibitions
- **Core-Zero-Mod**: `src/core` 수정 금지.
- **Secret-Isolation**: 시크릿은 `GraphState`, `session_state`, `SQLite DB`에 절대 기록되지 않는다.

---
**Design Rejection Required**: 시크릿 정보를 `ExecutionPlan`에 심거나 `GraphState`를 통해 전달하려는 설계는 즉시 거부됨.
