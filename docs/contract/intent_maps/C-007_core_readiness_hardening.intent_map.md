# C-007: Intent → Contract Map (Core Readiness Hardening)

## 1. 개요 (Overview)
본 문서는 `PRD-007`의 하드닝 의도를 `B-007` 계약 규칙으로 연결하고, 이를 검증하기 위한 정적 분석 및 테스트 전략을 매핑한다.

## 2. Intent → Contract 규칙 매핑

| Intent (의도) | Contract Rule (계약 규칙) | 검증 근거 (Evidence) |
| :--- | :--- | :--- |
| **I-1. 구조적 가드 강제** | B-007-2.1: 가드 호출 강제 | Core Service 진입점 내 가드 함수 호출 여부 코드 스캔 |
| **I-2. 로직 결정론 확보** | B-007-2.2: 결정론적 로직 보장 | 정적 스캔: `Date.now()`, `Math.random()` 호출 코드 전무함 확인 |
| **I-3. 영속성 계층 격리** | B-007-3.0: Repository Purity | Repository Interface 반환 타입의 DTO 여부 검사 |
| **I-4. 실패 모델 단일화** | B-007-4.1: Result 패턴 격리 | Core 소스 코드 내 `Result` 타입 참조 여부 정적 분석 |
| **I-5. 시스템 에러 통제** | B-007-4.2: Unknown Error Wrapping | Adapter 경계 테스트에서 비정형 예외의 시스템 에러 변환 확인 |
| **I-6. 참조 격리 보장** | B-007-5.0: Snapshot Invariant | Immutability Test: 반환값 변조 후 재조회 시 원본 유지 확인 |

## 3. 검증 전략 (Verification Strategy)

### 3.1 정적 패턴 분석 (Static Analysis)
- **금지 코드 정밀 검사:** 다음 패턴 발견 시 CI 빌드를 즉시 차단한다.
    - `new Error(` 호출 (Core 내 원시 에러 생성 금지)
    - `throw "string"` (원시 문자열 throw 금지)
    - `throw new Error(` (원시 에러 객체 throw 금지)
    - `Date.now()`, `new Date()`, `Math.random()` (비결정적 API 직접 사용 금지)
- **허용:** `CoreError` 타입 및 그 생성은 허용한다. "Error" 키워드 자체를 일괄 금지하지 않는다.
- **레이어 오염 검사:** Core가 Adapter의 응답 정책이나 `Result` 타입을 참조하는지 `dependency-cruiser`로 감시한다.

### 3.2 런타임 및 테스트 에비던스
- **Snapshot Mutation Test (I-6 매핑):** 
    - `B-007-5.0` 준수 확인을 위해 반환된 객체의 필드를 강제로 수정한다.
    - 수정 후 동일 식별자로 다시 데이터를 조회했을 때 원본 데이터에 변경이 없음을 단언(Assert)한다.
- **SSOT Exhaustive Test:** Adapter의 단일 변환 함수가 모든 CoreErrorCode를 누락 없이 처리하는지 검증한다.

## 4. Review Gate (승인 체크리스트)

- 모든 Core Service 진입점에서 입력 가드가 명시적으로 실행되는가? (B-007-2.1)
- Core 내부에서 `Result` 타입을 반환하거나 참조하는 코드가 전무한가? (B-007-4.1)
- `new Error(` 대신 오직 규격화된 `CoreError`만 사용되고 있는가? (금지 패턴 섹션 참조)
- 반환되는 DTO가 원본 데이터와 참조가 분리된 스냅샷임이 테스트로 증명되었는가? (B-007-5.0)
- Adapter 계층에 `transformResponse`와 같은 단일 변환 접점(SSOT)이 존재하는가? (어댑터 변환 책임 섹션 참조)
- Adapter 경계에서 Unknown Error를 시스템 에러 정책으로 래핑하고 있는가? (B-007-4.2)
