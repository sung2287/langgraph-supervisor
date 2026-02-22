# PRD-012: Provider / Model Override UX

## 1. 목적 (Goal)
정책 파일(`Policy`)에 정의된 기본 모델과 프로바이더 설정을 실행 시점에 동적으로 변경할 수 있도록 하여, 다양한 모델 테스트 및 비용 관리를 용이하게 한다.

## 2. 핵심 가치 (Core Values)
- **Flexibility**: 코드나 정책 파일 수정 없이 실행 시점에 즉각적인 모델 교체 가능.
- **Session-Hash-Strict**: 오버라이드로 인한 실행 계획(`Plan`) 변경 시 세션 정합성을 엄격히 보호.
- **Transparent-Priority**: 설정 우선순위를 명확히 하여 혼선을 방지.

## 3. 설계 요구사항 (Requirements)

### 3.1 우선순위 (Precedence Rules)
1. **Web UI Selection** (가장 높음)
2. **CLI Flag** (`--provider`, `--model`)
3. **Environment Variable** (`LLM_PROVIDER`, `LLM_MODEL`)
4. **Policy Default** (가장 낮음)

### 3.2 세션 및 해시 처리 (Strict Hash Flow)
- **Flow**:
  1. **Override 감지**: 런타임 어댑터가 실행 시점에 프로바이더/모델 오버라이드를 확인한다.
  2. **Plan Hash 계산**: Runtime Orchestrator가 ExecutionContextMetadata를 포함한 예상 Plan Hash를 계산한다.
  3. **Mismatch 확인**: 기존 세션의 해시와 불일치하는지 검사한다.
  4. **Fail-Fast 종료**: `FileSessionStore.verify`에서 해시 불일치 감지 시 즉시 예외(`SESSION_STATE_HASH_MISMATCH`)를 발생시키고 실행을 중단한다.
  5. **가이드 제공 (UX)**:
     - **CLI**: `run:local failed` 출력과 함께 사용자가 `--fresh-session` 또는 새로운 `--session` 네임스페이스로 재실행하도록 안내 문구를 출력한다.
     - **Web UI**: 동일하게 해시 불일치 에러를 표시하고, 사용자가 "새 세션으로 시작" 버튼 등을 통해 재실행을 선택하도록 유도한다.
- **세션 보존 (Backup-Rename)**: `--fresh-session` 사용 시 기존 세션 파일은 파괴적으로 삭제되지 않으며, `ops/runtime/_bak/` 폴더로 `rename`되어 보존된다.

### 3.3 Plan Hash Clarification
- **Execution Context Reflect**: `Plan Hash`는 `ExecutionPlan` 구조와 `execution context metadata`를 기반으로 계산된다.
- **SSOT for Canonicalization**: `provider.router.ts`(`parseProvider` 등)가 정규화의 단일 책임을 가진다. Environment variable parsing 및 provider/model canonicalization은 provider.router.ts에 단일 귀속되며, Adapter는 alias 매핑, trim, 대소문자 변환 등의 임의 정규화를 수행하지 않는다.
- **Metadata Components**: `execution context metadata`는 다음 요소로만 구성되어야 한다:
  - `provider`, `model`, `mode`, `domain`.
- **Secret Exclusion**: Secret 값(API Key 등)은 해시 계산에 포함되지 않는다.
- **Deterministic**: 해시 계산은 반드시 결정론적(Deterministic)이어야 하며, `timestamp`나 `random` 값 등 가변 정보는 포함할 수 없다.
- **Structural Immutability**: 오버라이드는 `ExecutionPlan`을 직접 수정하지 않으며, 오직 해시 계산에 사용되는 `execution context`에만 반영된다.
- **Extensions Field**: `ExecutionPlan.extensions`는 여전히 빈 배열 `[]`을 유지하며, 오버라이드 정보는 `Context` 변경으로 정의한다.
- **Volatile Overrides**: 오버라이드된 `provider/model` 정보는 `session_state.json` 스키마(`WHITELIST_KEYS`)에 저장되지 않으며, 실행 단위의 휘발성 설정으로 유지된다.

## 4. 제약 사항 (Constraints)
- **Core-Zero-Mod**: `src/core` 내의 해시 검증 로직 및 `FileSessionStore.verify`의 에러 타입은 수정하지 않는다.
- **Error Detection**: 별도의 에러 클래스 대신 에러 메시지의 `SESSION_STATE_HASH_MISMATCH` prefix를 통해 불일치 여부를 판별한다.
- **Adapter-Only Validation**: 프로바이더별 `model allowlist` 검증은 어댑터 레벨에서만 수행한다.
- **No-Automatic-Rotation-On-HashMismatch**: HashMismatch는 자동 로테이션을 수행하지 않는다. Rotation은 사용자가 명시적으로 `--fresh-session`을 선택한 경우에만 수행된다.
  - HashMismatch 자체는 Fail-Fast 종료만 수행한다.
  - fresh-session 호출 시 기존 파일은 `_bak` 폴더로 rename 백업된다. 데이터 파괴는 발생하지 않는다.
- **No-Env-Alias-In-Adapter**: Adapter 레벨에서 환경 변수 alias 매핑은 금지된다.

## 5. Runtime Boundary Rule
- **No Direct Core Import**: `src/core` 모듈을 직접 임포트하는 행위는 금지된다.
- **Unified Entry Point**: 모든 오버라이드 로직은 `Runtime Orchestrator` 진입 전 어댑터 레벨에서 완료되어야 한다.

## 6. Deterministic Execution Rule
- **Deterministic**: Plan Hash 및 실행 로직은 결정론적(Deterministic)이어야 한다.
- **No Structural Change**: 오버라이드는 `ExecutionPlan`의 구조를 절대 변경하지 않는다.
- **Extensions Field**: `ExecutionPlan.extensions`는 항상 `[]`를 유지한다.

## 7. LOCK Summary & Prohibitions
- **LOCK Summary**:
  - **Core-Zero-Mod**: `src/core` 및 `FileSessionStore` 에러 로직 수정 금지.
  - **Session-Hash-Strict**: 해시 불일치 시 예외 없이 실행 중단(Fail-Fast).
  - **Backup-Rename Preservation**: 세션 로테이션은 데이터 파괴가 아닌 백업-이동(Rename) 보존 방식임.
  - **Volatile Overrides**: `session_state` 스키마 확장 없이 실행 컨텍스트 내에서만 오버라이드 관리.
  - **No-Extensions-Usage**: `extensions` 필드 활용 금지.
  - **No-Automatic-Rotation-On-HashMismatch**: HashMismatch 시 자동 로테이션 금지, 명시적 fresh-session 요청 시에만 백업-이동 수행.
  - **No-Env-Alias-In-Adapter**: Adapter는 provider/model canonicalization을 수행하지 않는다.

---
**Design Rejection Required**: 세션 해시 불일치를 무시하고 기존 세션 데이터에 새로운 모델 결과를 덮어쓰려는 설계는 시스템 무결성 파괴로 간주됨.
