# PRD-009: Core I/O Immutability (입출력 불변 조건 최종 고정)

## PRD Type
- FUNCTIONAL

---

## 1. Meta

- prd: PRD-009
- action: core_io_immutability
- owner: human
- reviewer: ChatGPT (Senior Reviewer)
- status: DRAFT
- last_updated: 2026-02-11
- depends_on:
  - PRD-001~003 (TOC CRUD Core)
  - PRD-005 (Core Error Model)
  - PRD-006 (Adapter Boundary)
  - PRD-008 (Core Error Contract)

---

## 2. One-liner

> Core 경계의 입력(Input)과 출력(Output) 규약을 “불변 조건(Immutable Contract)”으로 봉인한다.

---

## 3. 목적 (Goal)

본 PRD의 목적은 다음을 최종 고정하는 것이다.

1. Core Service의 Input DTO 구조
2. Core Service의 Output DTO 구조
3. null / undefined 허용 정책
4. 필수/선택 필드 기준
5. timestamp 생성 책임 주체
6. 내부 에러 → 외부 노출 경계 재확인

이 PRD는 기능을 추가하지 않는다.
이 PRD는 **Core를 흔들 수 있는 모든 I/O 변형 가능성을 차단**한다.

---

## 4. 비목표 (Non-Goals)

- 새로운 기능 추가
- Adapter 계층 수정
- DB persistence 설계 확장
- UI/HTTP 응답 구조 정의

본 PRD는 오직 Core 내부의 I/O 계약만 다룬다.

---

## 5. 범위 (Scope)

### 포함
- src/core/** 의 모든 service 반환 타입
- DTO 정의
- repository 반환 타입 계약

### 제외
- adapter/** 응답 포맷
- 외부 API 스키마
- CLI 출력 형식

---

## 6. Core Input 규칙 (Immutable Input Rules)

### 6.1 DTO는 Plain Object여야 한다
- class 인스턴스 금지
- prototype 확장 금지
- side-effect 포함 객체 금지

### 6.2 undefined 금지 정책
- Core 입력 DTO는 undefined를 허용하지 않는다.
- 선택 필드는 명시적으로 optional로 정의되어야 한다.

### 6.3 timestamp 생성 책임
- created_at / updated_at 생성은 Core 내부에서만 수행한다.
- 외부에서 전달된 timestamp는 신뢰하지 않는다.
- 테스트 가능성을 위해 Core는 Date.now()를 직접 호출하지 않는 것을 권장한다.
- 시간 생성은 TimeProvider 인터페이스(또는 동등한 추상화)를 통해 주입받는 방식을 기술 표준으로 권장한다.

---

## 7. Core Output 규칙 (Immutable Output Rules)

### 7.1 Output은 DTO Snapshot이다
- mutable reference 반환 금지
- 내부 상태 객체 직접 노출 금지
- Core는 반환 시 다음 중 하나를 반드시 보장해야 한다:
  1. Deep Copy 수행 후 반환
  2. 애초에 불변(Immutable) 구조만을 생성하여 반환
- 외부 계층(Adapter)에서 반환 객체를 수정하더라도 Core 내부 상태는 절대 변경되지 않아야 한다.
- 참조 공유(Reference Sharing)로 인한 오염 가능성은 설계 위반으로 간주한다.

### 7.2 null 정책
- null 허용 여부는 명시적으로 정의되어야 한다.
- undefined는 반환값으로 사용하지 않는다.

### 7.3 에러 반환 방식
- Core는 Error 객체를 throw한다.
- 반드시 PRD-008에서 정의된 Canonical ErrorCode를 포함한 CoreError 구조만을 throw해야 한다.
- Core는 PRD-008에서 정의된 Core Origin Code(E_CORE_* 및 E_CONTRACT_MISMATCH)만 생성할 수 있다.
- Core는 ERROR_REGISTRY 또는 정책 메타데이터(HTTP Status, CLI Exit Code 등)에 접근하거나 의존할 수 없다.
- 임의의 Error, string throw, unknown throw는 금지한다.
- Result 타입(ok:false) 반환 금지 (Adapter 계층 책임).

---

## 8. Repository 계약 고정

- repository는 Domain Entity를 반환하지 않는다.
- repository는 Core DTO에 맞는 구조만 반환한다.
- repository는 side-effect 없는 pure data 반환만 허용한다.

---

## 9. 테스트 요구사항

- 모든 Core service에 대해:
  - 입력 변조 테스트
  - 출력 불변성 테스트
  - undefined 차단 테스트
  - timestamp 생성 책임 테스트

테스트는 결정론적이어야 한다.
(Date / Random / 외부 I/O 금지)

---

## 10. 승인 조건 (Done Definition)

다음 조건이 모두 충족되어야 PRD-009는 종료된다.

1. Sandbox → Core 승격 완료
2. Core 기준 typecheck PASS
3. Core 기준 test PASS
4. PRD-008 Canonical Error Contract(B-008)가 정본 경로에 존재하고 LOCKED 상태임
5. PRD-008 Drift 방지 규칙(Exhaustive Check, Closed Set)이 CI에서 활성화되어 있음
6. Reviewer APPROVED 판정 기록 존재
7. _review/ 경로에 사이클 기록 저장

---

## 11. 위험 요소 (Risk)

- 기존 테스트가 I/O 변경에 의존하고 있을 가능성
- Adapter 계층이 암묵적으로 의존하고 있는 필드 존재 가능성
- PRD-008과 계약 불일치 발생 가능성

---

## 12. 철학적 위치

PRD-009는 기능 확장이 아니라
Core를 “프랜차이즈 본점”으로 고정하기 위한
최종 구조 봉인 단계다.

