# D-006_adapter_layer.platform.md

## 1. 목적 (Purpose)

본 문서는 **PRD-006 Adapter Layer**의 규칙을 **물리적인 제약(Platform Constraint)** 수준에서 강제하여, 구조적 위반을 원천 차단하는 것을 목적으로 한다.

---

## 2. Directory Structure Rules

디렉토리 구조는 레이어의 책임을 명확히 분리하도록 강제된다.

### 2.1 Interface Definition
- Core와 Adapter가 소통하는 인터페이스는 반드시 **Core 레이어 내부**에 위치해야 한다.
- **경로**: `src/core/**/ports/` (또는 이와 동등한 Core 내부 위치)
- Adapter는 이 경로에 정의된 인터페이스를 `implements` 하거나 호출한다.

### 2.2 Adapter Separation
- Adapter 구현체는 프로토콜별로 물리적으로 분리되어야 한다.
- **경로 예시**:
    - `src/adapter/http` (Web API)
    - `src/adapter/cli` (Command Line Interface)
- 서로 다른 Adapter 간의 직접 참조는 금지된다.

---

## 3. Import Dependency Rules

정적 분석 도구(ESLint, dependency-cruiser 등)를 통해 다음 Import 규칙을 자동 검사해야 한다.

### 3.1 Allowed Imports (허용)
- `adapter` → `core/**/ports` (Interface, Input DTO)
- `adapter` → `core/**/dto` (Output DTO)
- `adapter` → `core/errors` (Error Definitions)

### 3.2 Prohibited Imports (금지)
- `adapter` → `core/**/internal` (Internal Implementation, Helpers)
- `adapter` → `core/**/repository` (Repository Implementations)
- `core` → `adapter` (Circular Dependency)
- **위반 시 빌드 및 테스트 단계에서 즉시 FAIL 처리한다.**

---

## 4. Entry Point & Encapsulation

### 4.1 Entry Point 제한
- Adapter는 외부(Framework 등)에 노출하는 **단일 진입 함수(Entry Function)** 만을 `public`으로 노출해야 한다.
- 그 외의 내부 변환 로직, 헬퍼 함수는 `private` 또는 모듈 내부 범위로 제한한다.

### 4.2 Core Invocation Scope
- Core 로직 호출은 반드시 Adapter의 **Entry Function 내부 실행 흐름** 안에서만 이루어져야 한다.
- 전역 상태나 Adapter 초기화 시점에 Core 로직을 미리 실행하는 것을 금지한다.

---

## 5. Test & Enforcement Rules

구조적 무결성을 보장하기 위해 다음 테스트 규칙을 적용한다.

### 5.1 Response Type Check
- Adapter가 반환하는 객체의 타입을 검사하여, **Core Domain Entity**가 포함되어 있는지 확인한다.
- Core Entity(메서드가 있는 클래스 인스턴스 등)가 Response DTO로 직접 변환 없이 나가는 경우 **테스트는 FAIL**이어야 한다.

### 5.2 Implementation Import Check
- Adapter 코드 내에서 Core의 **구현체 파일(service.ts, repository.ts 등)** 을 Import 하는 구문이 발견되면 **정적 분석 단계에서 FAIL** 처리한다.
- 오직 `*.port.ts`, `*.dto.ts`, `*.interface.ts` 등 정의 파일만 Import 가능하다.

---

## 6. Summary of Hard Constraints

| 구분 | 규칙 | 위반 시 결과 |
|---|---|---|
| **Directory** | `core/ports`에 Interface 정의 | (관습적 강제) |
| **Import** | Adapter -> Core Impl 금지 | **Build Fail** |
| **Import** | Core -> Adapter 금지 | **Build Fail** |
| **Runtime** | Core Entity 외부 노출 | **Test Fail** |
| **Runtime** | Core Error 그대로 노출 | **Test Fail** (Error Mapping 필수) |