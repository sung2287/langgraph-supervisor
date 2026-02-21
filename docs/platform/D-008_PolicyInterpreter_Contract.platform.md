# D-008: PolicyInterpreter Contract Platform (Revised v2)

## 1. Migration Scope

| Responsibility | Before | After | Safe (Y/N) |
| :--- | :--- | :--- | :---: |
| Legacy Step Mapping | `graph.ts` | `interpreter.ts` | Y |
| Payload Canonicalization | `graph.ts` / Handlers | `PolicyInterpreter` | Y |
| Domain Management | Implicit in Logic | Runtime State (Explicit) | Y |
| Phase Validation | CLI | `PolicyInterpreter` | Y |
| Execution Validation | Core (Partial) | Core (PRD-007 Full) | Y |

- Phase Validation 책임은 CLI → Interpreter로 이동한다.
- CLI는 입력 파싱만 담당하며, 정책 적합성 판단(Phase 존재 여부 등)은 Interpreter에서 수행한다.

## 2. 책임 이동 (Ownership Shift)
- **`src/core/graph.ts`**: 정책 구문 해석 기능을 제거하고, 오직 `NormalizedExecutionPlan`을 받아 실행하는 역할로 축소.
- **`src/policy/interpreter.ts`**: 정책 YAML 로드, 필드 변환, StepType 정규화, Phase 유효성 검증 기능을 캡슐화하여 신규 생성.

## 3. Core 보호막 (Core Shield)
- **`validateExecutionPlan()`**: Interpreter의 결과물을 불신하고 재검증하는 로직을 Core 내부에 견고히 유지한다. (Cross-validation 구조 강제)

---
*Last Updated: 2026-02-21 (Revised v2)*
