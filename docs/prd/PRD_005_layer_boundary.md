# PRD-005: Layer Boundary Fixation

## PRD Type
- FUNCTIONAL (Structure / Governance)

---

## 1. 목적 (Why)

본 PRD의 목적은 **core / sandbox / adapter 레이어 간 의존성 경계를 명시적으로 고정**하여,
향후 구현 실수, AI 에이전트의 무의식적 침범, 구조적 부패를 **사전에 차단**하는 것이다.

이 PRD는 기능 추가를 하지 않는다.
본 PRD의 성공 기준은 **“잘못된 구조를 시도하면 반드시 실패한다”** 이다.

---

## 2. 문제 정의 (Problem)

현재 구조에서는 다음 위험이 상존한다:

- core 코드가 adapter / infra / env를 **직접 참조할 가능성**
- sandbox 코드가 core 규칙을 우회해 **사실상 core 역할을 수행**할 가능성
- 리뷰 시 구조 위반을 **사람의 눈에 의존**해야 하는 상태

이는 장기적으로 다음 문제를 야기한다:

- Core 불변성 붕괴
- 테스트 신뢰도 하락
- PRD/Contract는 맞지만 실제 시스템은 다른 상태

---

## 3. 목표 (Goals)

### 반드시 달성해야 하는 목표

1. core는 외부 세계(adapter, infra, env)를 **직접 알 수 없다**
2. core는 오직 **Port / Interface** 를 통해서만 외부와 상호작용한다
3. 위반 시:
   - 코드 리뷰 이전에
   - 테스트 단계에서
   - **자동으로 실패한다**

### 명시적 비목표 (Non-Goals)

- 새로운 비즈니스 기능 추가 ❌
- 성능 최적화 ❌
- adapter 구현 확장 ❌

---

## 4. 범위 (Scope)

### 포함 범위

- `/src/core/**`
- `/src/sandbox/**`
- `/src/adapter/**` (존재하는 경우)
- 레이어 간 import 규칙
- 구조/정책 테스트

### 제외 범위

- 런타임 동작 변경
- 배포 설정
- CI 파이프라인 변경 (단, 테스트 추가는 허용)

---

## 5. 핵심 규칙 (Core Rules)

### 5.1 Core Layer 규칙

- core는 다음을 **직접 import 할 수 없다**:
  - adapter
  - infra
  - env / process / runtime configuration
- core는 **sandbox를 참조할 수 없다**
- core는 오직 **자신의 도메인 + 정의된 Interface(Port)** 만을 ### 5.2 Sandbox Layer 규칙

- sandbox는 core를 참조할 수 있다
- sandbox는 adapter / infra 를 실험적으로 참조할 수 있다
- sandbox 코드는 core 승격 전 단계로만 사용된다

#### Sandbox → Core 승격 조건 (오염 방지)
- core로 승격되는 코드는 **adapter/infra/env 의존성이 0이어야 한다.**
- 승격 전, 외부 의존성은 반드시 **core 내부 Port/Interface로 치환**되어야 한다.
- 승격 시점에 외부 의존성이 남아있으면, 이는 **구조 위반(HOLD)** 사유이다.

### 5.3 Adapter Layer 규칙 방향은 항상 **외부 → core** 로 향해야 한다.

### 5.2 Sandbox Layer 규칙

- sandbox는 core를 참조할 수 있다
- sandbox는 adapter / infra 를 실험적으로 참조할 수 있다
- sandbox 코드는 core 승격 전 단계로만 사용된다

### 5.3 Adapter Layer 규칙

- adapter는 core를 참조할 수 있다
- adapter는 core 내부 구현을 침범할 수 없다

---

## 6. 성공 기준 (Acceptance Criteria)

본 PRD는 아래 조건을 **모두** 만족해야 완료로 판정된다.

1. core에서 금지된 import 발생 시:
   - 테스트가 실패한다
2. 테스트는 다음 성격을 가진다:
   - 기능 테스트 ❌
   - **구조 / 정책 테스트 ⭕**
3. 테스트 실패 원인은 로그만 보고도
   - "어떤 경계를 어겼는지"가 식별 가능해야 한다
4. CI에서 구조/정책 테스트가 실패하면:
   - PR은 **HOLD 신호**로 취급되며
   - (Branch Protection에서 해당 체크를 Required로 두는 한) **Merge는 차단**된다

---

## 7. 검증 전략 (Validation Strategy)

- 정적 분석 기반 테스트 사용 가능
- 파일 경로 기반 import 검사 허용
- 런타임 실행 여부와 무관하게 실패해야 한다

구현 수단 예시(비강제):
- `dependency-cruiser` 규칙으로 금지 경로 import 탐지
- `eslint-plugin-import`의 restricted-paths 계열 규칙으로 경로 제약

> 이 테스트는 시스템을 검증하는 것이 아니라
> **시스템을 감시하는 장치**다.

---

## 8. 산출물 (Deliverables)

- 정적 분석 기반 테스트 사용 가능
- 파일 경로 기반 import 검사 허용
- 런타임 실행 여부와 무관하게 실패해야 한다

> 이 테스트는 시스템을 검증하는 것이 아니라
> **시스템을 감시하는 장치**다.

---

## 8. 산출물 (Deliverables)

- PRD 문서 (본 문서)
- 구조/정책 테스트 코드
- 필요 시 최소한의 core 코드 이동 또는 분리

---

## 9. Reviewer 판정 기준

Reviewer는 다음 질문에만 답한다:

> "이제 core가 실수로 외부를 알 수 있는가?"

- YES → HOLD
- NO  → APPROVED

---

## 10. 완료 후 절차

1. Reviewer 판정 기록
2. Human 승인
3. PRD-005 완료 DELTA 작성
4. `state:cycle`
5. `state:promote`

---

## 한 줄 요약

> **PRD-005는 기능이 아니라 안전벨트다.**
> 한 번 잠그면, 실수 자체가 발생하지 않는다.

