# PRD-004: Session Persistence

## Objective
AI Orchestration Runtime의 세션 상태를 파일 기반으로 영속화하여, 프로세스 재실행 시에도 최소한의 참조 정보를 복구하고 연속성을 유지하도록 한다.

## Background
- 현재 런타임은 메모리 기반으로 동작하여 재실행 시 모든 상태가 초기화됨.
- 대규모 리포지토리 분석 정보 및 세션 연결성을 유지하기 위해 영속화가 필요함.
- Core의 내부 구조를 노출하지 않으면서 세션을 복원하는 설계가 필요함.

## Scope
- `ops/runtime/session_state.json` 파일 기반 영속 저장.
- 세션 최소 참조(Ref) 정보만 저장 및 복원.
- 세션 시작 유형(Cold Start/Resume)의 명확한 구분 및 검증.
- `SessionStore` 인터페이스를 통한 파일 기반 전용 저장소 구현.

## Non-Goals
- Core 내부 GraphState(nodes, values) 전체 직렬화.
- Execution Plan 자체 저장.
- SQLite 기반 저장 (PRD-006에서 별도 처리).
- 세션 데이터의 버전 마이그레이션.

## Architecture
- **SessionStore Interface**: Core 런타임은 구체적인 저장 방식을 알지 못하도록 추상화된 인터페이스를 사용하며, PRD-004는 파일 시스템을 직접 사용하는 구현체만 정의함.
- **Persistence Lifecycle**: 
  - 런타임 시작 시 `session_state.json` 존재 여부 확인 후 로드 및 검증.
  - **저장 시점**: 전체 Execution Cycle 종료 후 1회로 제한 (부분 저장 방지).
  - **Cold Start 생성 타이밍**: Cold Start에서는 `session_state.json`이 없을 수 있으며, 이 경우 파일 생성은 Execution Cycle 성공 종료 시점의 save(1회)에서 최초 수행한다. Boot 단계에서의 자동 파일 생성을 금지한다.
  - Atomic Write 전략을 사용하여 파일 손상 방지.
- **Hash Computation Boundary**: `lastExecutionPlanHash`는 Runtime(PolicyInterpreter)이 결정론적으로 산출한다. `SessionStore`는 해시를 생성/해석/재구성하지 않고, 오직 저장 및 검증(비교)만 수행한다.
- **updatedAt Generation**: `updatedAt`은 저장 시점에 `FileSessionStore`(또는 Runtime Adapter)가 ISO timestamp로 채운다. Core Engine은 시간 생성 로직에 의존하지 않는다.
- **Neutrality Rule**: 모든 런타임 동작은 executionPlan에 정의된 Step을 통해서만 실행된다. Core Engine은 직접적인 기능 플래그(Boolean), 정책 파일, 저장 구현을 참조하지 않는다.

## Data Structures
### SessionState (JSON)
Core 내부 구조를 침범하지 않는 최소 참조 정보만 포함:
```json
{
  "sessionId": "uuid-string",
  "memoryRef": "memory-id-v1",
  "repoScanVersion": "v1.2.3",
  "lastExecutionPlanHash": "sha256-hash",
  "updatedAt": "ISO-8601-timestamp"
}
```
- **lastExecutionPlanHash**: 정책 변경에 따른 세션 오염(Session Contamination)을 방지하기 위한 안전 장치이다. 이는 다음 요소들의 Canonical Representation을 기반으로 결정론적(Deterministic)으로 생성된다:
  - 선택된 policy profile 경로
  - `modes.yaml`, `triggers.yaml`, `bundles.yaml`
  - PolicyInterpreter가 생성한 `executionPlan` JSON (Stable key ordering 기준)
  - Canonical Rule: JSON Stable Canonical Stringify(Key 정렬) + UTF-8 Encoding + No unnecessary whitespace.

## Execution Rules
- **세션 시작 조건**:
  - `session_state.json` 미존재 → **Cold Start** (초기화).
  - 파일 존재 및 `lastExecutionPlanHash` 일치 → **Resume** (상태 복원).
  - 파일 존재하나 `lastExecutionPlanHash` 불일치 → **Fail-Fast** (정책 변경 감지 시 자동 재초기화 금지).
- **Core Engine 독립성**: Core Engine은 저장 계층, 요약 알고리즘, 검색 알고리즘의 구현 세부사항을 알지 못한다. 모든 동작은 executionPlan에 정의된 Step을 통해 간접적으로 호출된다.
- **의존 관계**: PRD-005, PRD-006에 의존하지 않음.

## Failure Handling
- **Fail-Fast Policy**: 손상된 파일이나 해시 불일치가 발견될 경우 런타임 시작을 즉시 중단함.
- **데이터 무결성**: 데이터 무결성에 영향을 주는 모든 실패는 Fail-Fast 원칙을 따른다. Best-Effort는 사용자 경험에만 적용되며, 저장 계층에서는 허용되지 않는다.

## Success Criteria
- 런타임 재시작 시 정책 변경이 없을 경우 이전 상태가 정상 복원됨.
- 정책(Policy) 변경 시 해시 불일치를 감지하여 안전하게 실행을 중단함.
- Core 내부 구조 변경 시에도 `SessionState` 구조가 영향을 받지 않음.
