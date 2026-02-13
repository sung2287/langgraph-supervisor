# AI Coding Constitution
# 적용 범위: /src/** 전체
# 모든 신규 코드 및 수정 코드에 강제 적용

---

## 1. Hardcoding Ban (하드코딩 금지)

### Rule
- 모든 값은 반드시 아래 중 하나에서만 온다:
  1) 함수 인자
  2) config 객체
  3) contract에 정의된 상수

### Forbidden
- 로직 내부에 직접 박힌 문자열/숫자 리터럴
- 파일 경로, ID, 상태값 하드코딩

### Allowed
- enum / const 로 중앙 정의된 값
- 테스트 코드 내부 리터럴

### Review Check
- “이 값은 왜 여기서 고정인가?”에 답하지 못하면 위반

---

## 2. No Shadow Concepts (기존 개념 재정의 금지)

### Rule
- 이미 존재하는 개념은 새로운 이름으로 재정의하지 않는다
- 같은 의미 = 같은 이름 = 같은 정의 위치

### Forbidden
- sceneId / scene_id / sceneIndex 혼재
- state가 있는데 status를 새로 만드는 행위

### Allowed
- 의미가 다른 경우 명확히 다른 이름 + 근거 주석

### Review Check
- “이 개념은 contract 어디에 정의돼 있는가?”

---

## 3. Reusability First (재활용 가능성 우선)

### Rule
- 모든 함수/모듈은 다른 맥락에서도 호출 가능해야 한다
- 특정 PRD/기능 이름이 코드에 박히면 위반

### Forbidden
- buildImageForStoryboardScene()
- 특정 파이프라인만 가정한 구현

### Allowed
- buildImage(input, options)
- 맥락은 호출부에서 주입

### Review Check
- “이 함수는 다른 프로젝트에서도 사용 가능한가?”

---

## 4. No Tight Coupling (기능 결합 금지)

### Rule
- 하나의 함수/모듈은 하나의 책임만 가진다
- I/O, 검증, 변환, 저장은 반드시 분리한다

### Forbidden
- API 호출 + 데이터 가공 + 저장을 한 함수에서 처리
- 다른 모듈의 내부 구조 직접 참조

### Allowed
- core / adapter / validator / transformer 분리

### Review Check
- “이걸 테스트하려면 무엇을 함께 띄워야 하는가?”

---

## 5. No Hidden State (암묵적 상태 사용 금지)

### Rule
- 전역 변수, 싱글톤 상태 사용 금지
- 모든 함수는 입력 → 출력이 명확해야 한다

### Forbidden
- 내부에서 몰래 읽는 shared state
- 호출 순서에 의존하는 로직

### Allowed
- 상태는 객체로 명시적 전달

### Review Check
- “호출 순서가 바뀌어도 안전한가?”

---

## 6. Contract First Principle (Contract 우선 원칙)

### Rule
- contract에 없는 필드/규칙은 코드에서 생성 금지
- 새 요구가 생기면 반드시:
  1) contract 수정 제안
  2) 승인 후 코드 반영

### Forbidden
- 코드에서 임의 필드 추가
- “있으면 좋을 것 같아서” 구현

### Review Check
- “이 필드/규칙은 contract에 정의돼 있는가?”

---

## 7. No Silent Failure (조용한 실패 금지)

### Rule
- 모든 실패는 반드시:
  - 명시적 에러 반환
  - 또는 구조화된 로그 기록

### Forbidden
- try/catch 후 무시
- undefined / null 반환으로 실패 은폐

### Allowed
- 실패 이유를 구조화된 객체로 반환

### Review Check
- “실패 시 호출자는 무엇을 알 수 있는가?”

---

## 8. Open for Extension (확장 지점 사전 확보)

### Rule
- 조건 분기가 늘어날 가능성이 있으면
  - 전략/핸들러 테이블로 분리한다

### Forbidden
- 조건문 3개 이상 중첩
- 타입/상태별 if/else 폭증

### Allowed
- map 기반 디스패치
- strategy pattern

### Review Check
- “새 타입이 추가되면 어디만 수정하면 되는가?”

---

## 9. Testability Guarantee (테스트 가능성 보장)

### Rule
- 모든 외부 의존성은 주입해야 한다
- 순수 로직은 단독 테스트 가능해야 한다

### Forbidden
- 내부에서 직접 생성하는 외부 객체
- mock 없이는 테스트 불가능한 구조

### Review Check
- “mock 없이 이 로직을 테스트할 수 있는가?”

---

## 10. AI-Specific Behavior Rules (AI 전용 행동 규칙)

### AI Must Not
- 의도 추측
- 설계도 확장
- 편의상 기능 통합

### AI Must
- 위반 가능성 발견 시
  - 코드 작성 대신 질문
  - 또는 patch 제안(diff)만 생성

---

## Enforcement

- 본 문서는 “권장사항”이 아닌 “법”이다
- 위반 시 코드 생성/수정은 거부되어야 한다
- 모든 리뷰는 본 헌법을 기준으로 판단한다
