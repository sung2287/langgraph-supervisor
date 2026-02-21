# PRD-008: PolicyInterpreter Contract (Revised v2)

## 1. 문제 정의
현재 정책(YAML)의 선언적 의도와 런타임의 구체적 실행 계획(`executionPlan`) 사이의 변환 로직이 `graph.ts` 및 CLI 레이어에 산재해 있습니다. 이로 인해 Core Engine이 정책의 세부 명칭(Legacy step names)을 직접 인지하게 되어 **Core Neutrality(Core 중립성)** 원칙이 훼손되고 있습니다. 

## 2. 목표
- 정책 문서(YAML)를 `NormalizedExecutionPlan`으로 변환하는 독립적인 **Interpreter 레이어**를 구축한다.
- Core Engine을 정책의 비즈니스 의미로부터 완전히 격리한다.
- `graph.ts` 내의 하드코딩된 매핑 로직을 제거하여 순수 실행기로 유지한다.

## 3. 핵심 원칙 (LOCK)

**[LOCK-1] Domain 추론 금지 (No Domain Derivation)**
- Interpreter는 Phase, Mode, 또는 정책 YAML 내용을 근거로 `currentDomain`을 스스로 결정하거나 추론해서는 안 된다.
- Domain 관리 책임은 오직 Runtime(State Manager)에 있으며, Interpreter는 외부에서 주입된 정보를 metadata에 반영하는 역할만 수행한다.

**[LOCK-2] Core 최종 권위 유지 (Core Final Authority)**
- Interpreter는 실행 정당성의 최종 결정자가 아니다.
- Interpreter가 생성한 Plan은 반드시 Core의 `StepContract validation`(PRD-007)을 통과해야 한다.
- Core의 `FailFast` 보호막은 Interpreter 도입과 무관하게 유지되며, 상호 검증(Cross-validation) 구조를 강제한다.

**[LOCK-3] 정규화 경계 준수 (Normalization Boundary)**
- Interpreter의 역할은 '필드명 변환', '기본값 보정', 'StepType 매핑'에 한정된다.
- 비즈니스 의미 판단, 실행 시점 데이터 생성, Core 내부 로직 대체 등 '판단'이 개입되는 로직은 수행하지 않는다.

**[LOCK-4] Phase/Mode Validation Ownership**
- Interpreter는 입력된 Phase(mode)가 현재 로드된 정책 프로필에 정의되어 있는지 반드시 검증해야 한다.
- 정의되어 있지 않은 경우, Interpreter 단계에서 명확한 `ConfigurationError`를 발생시킨다.
- 유효하지 않은 Phase(Invalid Phase)가 graph/Core 단계로 전달되어서는 안 된다.
- CLI는 Phase 허용 목록의 SSOT가 아니며, Phase 허용 여부의 최종 판단 책임은 Interpreter에 있다.

## 4. Acceptance Criteria
- **Domain 격리**: Interpreter 내부에서 `currentDomain` 값을 생성하는 로직이 없음.
- **Phase 검증**: 유효하지 않은 Phase는 Interpreter 단계에서 차단하며, graph/Core까지 전달되지 않음.
- **CLI 역할 한정**: CLI에 Phase enum이 존재하더라도, 최종 유효성 판단은 Interpreter가 수행함.
- **Core 보존**: PRD-007에 정의된 Core validation 로직이 수정되거나 약화되지 않음.
- **의미 격리**: `graph.ts` 및 Core 모듈이 특정 정책의 명칭이나 비즈니스 의도를 인지하지 못함.
- **매핑 제거**: `graph.ts` 내에 legacy mapping(`recall`, `memory_write` 등)이 남아있지 않음.

## 5. Non-Goals
- 새로운 UX 플래그 또는 기능 추가 금지.
- PRD-007에서 정의된 12종 StepType 외 확장 금지.
- PRD-009의 Provider Routing 로직 수정 금지.
- Core의 실행 의미(Semantics) 수정 금지.

---
*Last Updated: 2026-02-21 (Revised v2)*
