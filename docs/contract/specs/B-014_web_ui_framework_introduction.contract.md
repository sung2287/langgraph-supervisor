# B-014: Web UI Framework Introduction Contract

## 1. 책임 경계 (Responsibility Boundary)
- **Server (SSOT)**: 세션, 도메인, 페이즈, 프로바이더, 모델의 최종 상태 및 해시 계산 권한을 가짐.
- **Client (UI)**: 서버로부터 수신한 `GraphStateSnapshot`을 기반으로 화면을 투영(Projection)하고 사용자의 명령(Intent)을 서버로 전달할 책임만 가짐.

## 2. UI Mode 정의
- **UI Mode**: `dev` | `prod` (환경 변수 또는 런타임 플래그 기반).
- **분기 규칙**: UI Mode는 오직 "렌더링 옵션(정보 노출 수준)"만 결정한다. UI Mode에 따라 Runtime(Server)의 비즈니스 로직이 분기되는 것은 엄격히 금지된다.

## 3. 데이터 계약 (API/DTO)
- **기존 계약 유지**: `GraphStateSnapshot`, `HistoryItem`, `ProviderResolutionEnv` 등 기존 DTO를 그대로 사용한다.
- **확장 제한**: 멀티모달 대응을 위한 스키마 확장은 PRD-018에서 별도로 다루며, 본 계약에서는 데이터 구조 수정을 금지한다.

## 4. 금지 규칙 (Strict Prohibitions)
- **Direct DB Access**: UI 레이어에서 Decision/Evidence SQLite DB에 직접 접근하거나 조작하는 행위 금지.
- **Core Type Leakage**: 브라우저 환경에서 `src/core` 내부 타입을 직접 참조하거나 임포트하는 행위 금지.
- **Local Authority**: 클라이언트 측에서 세션 해시를 임의로 생성하거나 검증 로직을 재현하는 행위 금지.
- **Derived Authority 금지**: UI는 `GraphStateSnapshot`으로부터 정책 해석, 단계 정규화, 해시 계산, 권한 판단 등 의미적 결정을 파생(Derive)하여 수행해서는 안 된다.

### 4.5 Build Boundary Enforcement
- React UI 코드에서 `src/core/**` 직접 참조는 금지한다.
- UI 번들에 Core 내부 구현 타입이 포함되는 경우 이는 계약 위반으로 간주한다.
- UI는 DTO Projection Layer로 한정된다.

### 4.6 Authority Non-Derivation Rule (Strengthened)
- 클라이언트는 Snapshot으로부터 의미적 권한을 파생(Derive)해서는 안 된다.
- 다음 행위는 명시적으로 금지된다:
  - 클라이언트 측 해시 계산
  - Step 순서 재구성
  - 정책 해석 결과 재평가
  - Domain 자동 추론

---
**RED FLAG**: UI 프레임워크 편리성을 위해 비즈니스 로직(예: 정책 해석, 단계 정규화)을 프론트엔드로 이관하려는 모든 설계 시도는 규정 위반임.
