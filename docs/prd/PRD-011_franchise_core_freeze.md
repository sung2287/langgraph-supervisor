# PRD-011: 프랜차이즈 본점 Core Freeze 선언

---

## 1. 목적 (Purpose)

본 PRD의 목적은 현재 main 브랜치에 존재하는 Core를
"프랜차이즈 본점 기준선(Baseline)"으로 선언하고 Freeze 상태로 고정하는 것이다.

이는 기능 추가를 위한 PRD가 아니며,
Core의 구조적 기준점을 확정하는 선언 단계이다.

---

## 2. Freeze 정의 (Definition of Freeze)

Freeze는 다음을 의미한다:

1. 현재 Core 구조를 본점 기준선으로 확정한다.
2. 이후 Core 변경은 반드시 명시적 PRD를 통해서만 수행한다.
3. 실험적 확장은 Core 외부 영역에서 진행한다.

Freeze는 개발 중단을 의미하지 않는다.
Freeze는 "무질서한 Core 변경의 종료"를 의미한다.
Freeze는 Core의 기능·계약·경계 구조를 기준선으로 확정하는 선언이다.

---

## 3. Freeze 대상 범위 (Scope)

### 3.1 물리적 범위

- `src/core/*`
- main 브랜치에 존재하는 해당 계층 코드

### 3.2 논리적 범위

- Core Error 모델
- Core I/O 불변 조건
- Adapter 경계 정의
- PRD-010에서 고정된 테스트 거버넌스

---

## 4. Freeze 이후 변경 원칙

Freeze 이후 Core를 수정하려면 반드시:

1. 새로운 PRD 생성
2. 테스트 존재 요건 충족 (PRD-010 준수)
3. Reviewer 명시적 승인
4. prd:close → state 승격 → Git 반영

임시 수정, 직접 수정, 예외적 우회는 허용되지 않는다.

---

## 5. Core와 확장 영역의 분리

Freeze 이후 신규 기능, 실험, 제품 확장은 다음 원칙을 따른다:

- Core 내부 직접 확장 금지
- Adapter 또는 상위 레이어에서 확장
- LAB PRD를 통한 실험 후 선택적 편입

Core는 "플랫폼 엔진"이며,
제품은 "프랜차이즈 지점"으로 간주한다.

---

## 6. 비목표 (Non-Goals)

본 PRD는 다음을 포함하지 않는다:

- 기존 코드 리팩토링 강제
- 테스트 전수 점검
- 자동화 강화
- 구조 변경

본 PRD는 기준선 선언이며,
기술적 구조 변경을 수반하지 않는다.

---

## 7. 완료 정의 (Definition of Done)

- PRD-011 문서 승인
- B/C/D 문서 작성 및 정합성 검증
- prd:close 성공
- state 승격
- Git main 반영

---

## 8. 구조적 의미

PRD-011은 개발 단계의 전환점이다.

이전 단계가 "Core 안정화"였다면,
이 단계는 "Core 제도화"이다.

이 시점 이후 Core는 본점으로서의 지위를 가진다.

모든 확장은 Core를 기준으로 이루어진다.

