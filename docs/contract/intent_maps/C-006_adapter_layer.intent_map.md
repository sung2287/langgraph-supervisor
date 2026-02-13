# C-006_adapter_layer.intent_map.md

## 1. 목적 (Purpose)

본 문서는 **Adapter Layer**가 시스템 내에서 수행해야 하는 **역할의 의도(Intent)** 와 **데이터 흐름(Flow)** 을 논리적으로 정의하고 고정한다.

---

## 2. Layer Intent Statement

> **"Adapter는 외부 세계의 불확실성을 Core가 이해할 수 있는 언어로 번역한다."**

이 문장은 Adapter의 존재 이유이며, 모든 구현은 이 문장을 실현하기 위해 존재해야 한다.

---

## 3. Logical Flow (단방향 흐름)

데이터와 제어의 흐름은 반드시 **외부에서 Core 방향**으로만 흘러야 한다.

```mermaid
graph LR
    External[External World
(User, Client, System)] -->|Raw Request| Adapter[Adapter Layer]
    Adapter -->|Pure Input DTO| Core[Core Layer]
    Core -->|Result / Error| Adapter
    Adapter -->|Response DTO| External
```

### 3.1 Flow Rules
1.  **Entry Point**: 외부 요청은 반드시 Adapter를 통해서만 Core로 진입할 수 있다.
2.  **One-Way Dependency**: Adapter는 Core를 알지만, Core는 Adapter를 알지 못한다.
3.  **No Bypass**: External이 Adapter를 거치지 않고 Core에 직접 접근하는 것은 불가능하다.

---

## 4. Translation Responsibility (번역 책임)

Adapter는 단순한 전달자가 아니라 **번역가(Translator)** 이다.

### 4.1 External → Adapter (Uncertainty)
- **상태**: 불확실함 (Untrusted, Raw)
- **책임**: 프로토콜 해석 (HTTP Body 파싱, CLI Argument 파싱)
- **산출**: Raw Data

### 4.2 Adapter → Core (Refinement)
- **상태**: 정제됨 (Trusted within Contract)
- **책임**:
    - Raw Data를 **Core Input DTO**로 매핑
    - 비결정적 정보(UUID, Time) 생성 및 주입
- **산출**: Input DTO

### 4.3 Core → Adapter (Meaning)
- **상태**: 의미 있는 결과 (Business Result)
- **책임**: 비즈니스 로직 수행 및 결과 반환
- **산출**: Core Result / Core Error

### 4.4 Adapter → External (Response)
- **상태**: 확정된 응답 (Formatted Response)
- **책임**:
    - Core Result를 **Response DTO**로 매핑
    - Core Error를 프로토콜에 맞는 에러 응답으로 변환 (Status Code 매핑 등)
- **산출**: Final Response (JSON, Console Output)

---

## 5. Single Entry Point Rule

- 각 유스케이스(Use Case)에 대해, Adapter는 Core로 진입하는 **단일 진입점(Single Entry Interface)** 을 사용해야 한다.
- 여러 Adapter 함수가 Core의 여러 내부 함수를 임의로 조합하여 호출하는 산탄식(Shotgun) 접근을 금지한다.