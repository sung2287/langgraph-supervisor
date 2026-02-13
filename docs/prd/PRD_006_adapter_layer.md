# PRD-006 Adapter Layer (HTTP / CLI)

## PRD Type
- FUNCTIONAL

---

## 1. 목적

본 PRD의 목적은 **core 도메인을 외부 세계로부터 완전히 분리한 상태에서**
HTTP / CLI 등의 외부 인터페이스를 제공하는 **Adapter Layer를 정의·고정**하는 것이다.

Adapter는:
- core의 내부 구조를 노출하지 않으며
- 입력/출력 변환 책임만을 가진다
- 비즈니스 판단을 수행하지 않는다

---

## 2. 문제 정의

현재 시스템은:
- core 자체는 안정화 단계에 진입했으나
- 외부 인터페이스(HTTP, CLI)에 대한 **정식 규약(PRD)** 이 존재하지 않는다

이로 인해 발생 가능한 리스크:
- adapter에서 비즈니스 로직이 증식
- core 변경이 외부 계약(API)에 직접적인 파괴를 유발
- 테스트 범위가 흐려짐

---

## 3. 범위 (Scope)

### 포함
- HTTP Adapter
- CLI Adapter
- Adapter ↔ Core 연결 규약

### 제외
- 인증/인가
- 배포 인프라
- UI / Frontend

---

## 4. 핵심 원칙 (LOCKED)

1. Adapter는 **core를 호출만 한다**
2. Adapter는 상태를 보관하지 않는다
3. Adapter는 domain 규칙을 해석하지 않는다
4. Adapter는 core error를 **변환만** 한다

> Adapter = 번역기, 중개자

---

## 5. 책임 분리

### Core
- 입력 검증 이후의 모든 비즈니스 판단 (Semantic / Business Validation)
- 도메인 규칙 위반 판정
- Error Code 정의 및 판정

### Adapter
- 외부 입력 수신 (HTTP / CLI)
- **형식·구조 검증(Syntactic / Schema Validation)**
  - 필수 값 누락, 타입 불일치, 포맷 오류 등
- DTO → Core Input 변환 (Port Interface 기준)
- Core Output → **Response DTO로 매핑 후** 외부 응답 변환
  - Core Domain Entity 직접 노출 ❌
- Error Code → HTTP Status / CLI Exit Code 매핑
  - Adapter 단계 검증 실패는 Adapter 전용 에러 코드 사용 가능 (예: `E_ADAPTER_BAD_REQUEST`)
  - `PublicMessage: Y` → core 메시지 노출 허용
  - `PublicMessage: N` → 표준 메시지로 치환

---

## 6. 성공 조건

- Adapter 코드에서 core 내부 구현체 직접 참조 ❌
- Adapter는 core의 **Input Port / Interface만 참조**
- 해당 Port / Interface의 정의 주체는 **core 레이어 내부**에 존재해야 함
- 모든 외부 요청은 **단일 Entry Point**를 통해 core에 전달됨
- 비결정적 정보(시간, UUID, Request ID 등)는 **Adapter에서 생성·주입**
- Core Error Policy가 Adapter에서 일관되게 변환됨

---

## 7. 검증 기준 (Reviewer)

Reviewer는 다음을 확인한다:

- Adapter에 비즈니스 로직이 존재하지 않는가
- Core Error Code 외의 판단 분기가 없는가
- Adapter가 core의 **Port Interface만 참조**하는가
- Adapter가 core로 **외부 라이브러리 객체를 그대로 전달**하고 있지 않은가
- Adapter 테스트가 정책 테스트로서 의미를 가지는가
- Core Domain Entity가 외부 응답(Response)에 포함되지 않는가

판정:
- APPROVED / HOLD

