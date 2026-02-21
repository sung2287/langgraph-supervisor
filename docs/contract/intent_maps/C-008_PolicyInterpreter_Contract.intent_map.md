# C-008: PolicyInterpreter Contract Intent Map (Revised v2)

## 1. 목적 (The Why)
정책 의도(YAML)가 실행 엔진(Core)을 오염시키는 것을 방지하고, 실행 전 단계에서 모든 규격 정합성을 맞추는 "사전 검문소" 역할을 수행하기 위함이다.

## 2. 리스크 통제
- **Logic Contamination**: 정책 명칭 변경이 시스템 핵심 로직(Core) 수정으로 이어지는 리스크 차단.
- **Implicit Domain Risk**: 자동 추론으로 인한 잘못된 데이터 범위(Scope) 적용 리스크 제거 (LOCK-1 반영).
- **Validation Leakage**: 유효하지 않은 실행 요청이 Core 내부 깊숙이 침투하여 에러를 발생시키는 리스크를 입구(Interpreter)에서 차단.

## 3. 레이어 무결성
- 본 PRD는 **입력 데이터의 정규화 형태 및 유효성**만 다룬다.
- Core의 `Executor`는 전달된 `steps[]` 배열의 규격 준수 여부만 판단하며, 비즈니스 규칙 위반은 Interpreter가 먼저 필터링한다.

---
*Last Updated: 2026-02-21 (Revised v2)*
