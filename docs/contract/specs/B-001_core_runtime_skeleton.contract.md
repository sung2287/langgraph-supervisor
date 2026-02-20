# B-001_core_runtime_skeleton.contract.md

## 1. Purpose
- Core Engine이 보장해야 하는 최소 실행 계약 정의
- Policy-Neutral 구조 보장 선언
- Core와 Policy Layer 간의 엄격한 실행 경계 고정

## 2. Core Invariants (절대 불변 조건)
- **executionPlan 중심 실행**: Core Engine은 오직 `executionPlan`에 정의된 단계(Step)만을 순차적으로 실행하며, 그 외의 워크플로우 로직을 내장하지 않는다.
- **currentMode의 비실행성**: `currentMode`는 오직 외부 표시 및 메타데이터 목적으로만 사용되며, Core Engine 내부에서 실행 분기 조건으로 사용될 수 없다.
- **정책 객체(policyRef)의 불변성**: 실행 사이클 동안 `policyRef`는 불변(Immutable) 상태를 유지해야 하며, 실행 도중 Core에 의해 수정될 수 없다.
- **Optional Plugin 호출**: Repository Scan을 포함한 모든 외부 도구는 `executionPlan`에 명시적으로 포함된 경우에만 호출된다.
- **Plug-and-Play 구조**: 특정 플러그인이나 도구가 제거되어도 Core Engine의 소스 코드 수정 없이 `executionPlan` 조정만으로 정상 동작이 유지되어야 한다.
- **Indirect Policy Access**: Core Engine은 policy 파일을 직접 읽거나 파싱하지 않는다. 모든 정책 해석 및 `executionPlan` 생성은 `PolicyInterpreter`의 독점적 책임이다.
- **Profile Agnosticism**: CLI 기반의 profile 선택은 Policy Layer에서만 처리되며, Core는 선택된 profile의 이름을 인지하거나 이에 의존하지 않는다.

## 3. Structural Guarantees
- **의미론적 중립성**: 엔진은 "코딩", "리뷰", "설계" 등 워크플로우의 도메인 의미를 해석하거나 이에 최적화된 내부 로직을 가지지 않는다.
- **분기 로직 금지**: Mode 값 또는 특정 상태 값에 따른 `if/else`, `switch` 기반의 워크플로우 분기 처리를 Core 내부에 구현하지 않는다.
- **추상적 단계 실행**: 모든 실행 단계는 추상화된 인터페이스를 따르며, Core는 각 단계의 구체적인 도메인 목적을 알지 못한 채 실행 결과만을 전달한다.

## 4. Prohibition (금지 조항)
- **Core 내부 Profile 참조 금지**: Core Engine 코드 내에서 profile 이름(예: 'coding', 'default')을 비교하거나 참조하는 로직을 작성하지 않는다.
- **Direct Directory Access 금지**: Core Engine 내부에서 policy 설정 디렉토리를 직접 참조하거나 파일 시스템을 통해 접근하지 않는다.
- **Interpreter 실행 금지**: `PolicyInterpreter`는 정책을 해석하여 `executionPlan`을 생성하는 역할에 국한되며, 직접 LLM 호출이나 파일 쓰기 등 runtime 실행 단계를 수행하지 않는다.

## 5. PRD-002 Alignment (Locked)
- Policy assets live under `policy/profiles/` as defined in PRD-002.
- Core Engine MUST NOT read any files under `policy/`.
- Profile selection occurs before Core invocation.
- Core receives `executionPlan` as a fully resolved artifact.
- Session persistence is not part of PRD-001 contract.

## 6. Non-Goals
- 특정 도메인(예: 소프트웨어 개발) 전용 기능 지원
- 코딩 워크플로우 또는 테스트 자동화 로직의 내장
- PRD 작성, 문서화 등 특정 태스크를 위한 전용 파이프라인 구축
