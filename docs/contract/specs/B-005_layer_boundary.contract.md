# B-005 : Contract Spec
(Layer Boundary & Dependency Governance)

---

## 1. 목적 (Objective)

본 Contract는 `PRD-005_layer_boundary`에 기반하여, 시스템의 **Core / Sandbox / Adapter** 레이어 간의 엄격한 경계와 의존성 규칙을 정의한다.
이는 소프트웨어 아키텍처의 구조적 건전성(Structural Integrity)을 보장하기 위한 절대적인 규약이다.

---

## 2. 레이어 정의 및 역할 (Layer Definitions)

### 2.1 Core
- **역할**: 순수 비즈니스 로직, 도메인 규칙, 정책의 집합체.
- **성격**: 외부 세계(I/O, Framework, Library)의 변경에 영향을 받지 않는 불변의 영역.

### 2.2 Adapter
- **역할**: Core와 외부 세계를 연결하는 매개체. Core가 정의한 인터페이스를 구현하거나, Core를 호출하여 사용한다.
- **성격**: 기술적 세부사항(DB, Web, File System)을 포함하며 변경이 잦은 영역.

### 2.3 Sandbox
- **역할**: 실험적 기능 구현, 프로토타이핑, 통합 테스트를 위한 격리된 공간.
- **성격**: 구조적 제약이 완화되나, Core로의 승격을 위해서는 정제(Refining)가 요구되는 영역.

---

## 3. 의존성 및 Import 규칙 (Dependency Rules)

모든 소스 코드는 위치한 레이어에 따라 다음 Import 규칙을 **반드시** 준수해야 한다.

### 3.1 Core (`src/core`)
- **허용 (Allowed)**:
  - 자기 자신 (`src/core/**`)
  - 언어 표준 라이브러리 (단, I/O 관련 제외)
- **금지 (Forbidden)**:
  - **Adapter 레이어 (`src/adapter/**`)**
  - **Sandbox 레이어 (`src/sandbox/**`)**
  - **외부 라이브러리 (NPM Packages, 3rd Party Libs)**
  - 프레임워크 종속성 (NestJS, React 등)

### 3.2 Adapter (`src/adapter`)
- **허용 (Allowed)**:
  - **Core 레이어 (`src/core/**`)**
  - 외부 라이브러리 및 프레임워크
- **금지 (Forbidden)**:
  - **Sandbox 레이어 (`src/sandbox/**`)** (원칙적 금지, 테스트 목적 예외 없음)

### 3.3 Sandbox (`src/sandbox`)
- **허용 (Allowed)**:
  - **Core 레이어 (`src/core/**`)**
  - **Adapter 레이어 (`src/adapter/**`)**
  - 외부 라이브러리
- **제약**:
  - Sandbox 코드는 Production 빌드에 포함되어서는 안 된다.

---

## 4. 인터페이스 소유권 규칙 (DIP Governance)

의존성 역전 원칙(DIP)의 이행을 위해 인터페이스(Port)의 정의와 소유권은 다음과 같이 규정된다.

1.  **Port 정의**: 외부와의 상호작용이 필요한 경우, **반드시 Core 내부**에 인터페이스(Interface/Port)를 정의한다.
2.  **구현 책임**: 정의된 Port의 구현체(Implementation)는 **반드시 Adapter 또는 Sandbox**에 위치해야 한다.
3.  **Core의 인지**: Core는 오직 자신이 정의한 Port만을 참조하며, 누가 그것을 구현했는지 알 수 없어야 한다.

---

## 5. 승격 조건 (Promotion Criteria)

Sandbox의 코드가 Core로 승격(Move to Core)되기 위한 필수 조건은 다음과 같다.

1.  **Dependency Zero**: 외부 라이브러리, 프레임워크, Adapter에 대한 모든 의존성이 제거되어야 한다.
2.  **Pure Functionality**: I/O 동작(DB 접근, API 호출 등)이 제거되거나 Port로 추상화되어야 한다.
3.  **Directory Compliance**: 승격되는 파일은 `src/core` 하위의 지정된 도메인 경로로 이동해야 한다.

---

## 6. 구조 위반 판정 (Violation Verdict)

정적 분석 또는 리뷰 과정에서 위 규칙을 위반한 사실이 발견될 경우, 판정은 다음과 같다.

- **HOLD**:
  - Core가 Adapter/External을 Import 하는 경우.
  - Core 내부에 구체적인 구현 클래스(Implementation)가 존재하는 경우 (Factory/DTO 제외).
  - 순환 참조(Circular Dependency)가 레이어 간에 발생하는 경우.

- **APPROVED**:
  - 위 금지 사항이 없으며, 단방향 의존성(Adapter -> Core)이 유지되는 경우.
