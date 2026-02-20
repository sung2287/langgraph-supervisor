# D-001_core_runtime_skeleton.platform.md

## 1. Execution Impact
- **추상 실행 루프 고정**: Core Engine은 `executionPlan`에 정의된 추상 단계(Step) 목록을 순차적으로 실행하며, 단계의 도메인 의미를 해석하지 않는다.
- **Blind Executor**: Core Engine은 단계의 의미를 이해하지 않는 Blind Executor이다. 단계 이름 및 타입은 Policy Layer에서 정의되며, Core는 사전에 등록된 핸들러 매핑을 통한 실행권 위임만 수행한다.
- **Fail-Fast Policy**: Policy resolution 단계에서 스키마 오류, 프로필 부재 등 문제가 발생할 경우 runtime은 즉시 종료(Fail-Fast)되어야 하며, 불완전한 상태로 Core Engine을 호출하지 않는다.

## 2. Required Files
- `agent/graph/graph.ts`: LangGraph 기반의 Core 실행 루프 구현체
- `agent/policy/resolver.ts`: (Belongs to PRD-002) 정책 파일로부터 `executionPlan`을 생성하는 해석기 (Fail-Fast 로직 포함). PRD-001 Core must not contain policy resolution logic.
- `agent/llm/llm.types.ts`: 도메인 중립적인 LLM 호출 인터페이스 정의
- `agent/memory/memory.types.ts`: 추상화된 상태 및 메모리 저장 인터페이스

## 3. Runtime Compliance Check
- **CLI Configuration**: CLI `--profile` 옵션의 기본값은 반드시 `default`로 설정되어야 한다.
- **Static Resolution**: Profile 선택 및 정책 해석은 실행 시작 시점에 완료되어야 하며, 실행 도중(In-flight) 프로필을 변경하는 기능은 제공하지 않는다.
- **Execution Guard**: Core Engine은 오직 Policy Layer로부터 검증된 유효한 `executionPlan`이 주어졌을 때만 실행 프로세스를 시작한다.

## 4. Separation Guarantee
Execution order must be:
1. CLI
2. `PolicyInterpreter` (PRD-002)
3. `CoreEngine` (PRD-001)

Core must never invert this order.

## 5. Operational Classification
- **기능 PRD**: 시스템의 핵심 기능을 형성함
- **Sandbox → Core 승격**: 초기 구현은 샌드박스에서 진행되나, 검증 후 시스템의 표준(Core)으로 즉시 승격됨
- **Auditor 호출**: 현재 구조에서는 불필요하나, 실행 계획의 스키마가 변경되거나 Core/Policy 경계가 모호해질 경우 아키텍처 감사가 필요함
