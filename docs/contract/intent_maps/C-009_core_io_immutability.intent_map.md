# C-009: Intent → Contract Map (Core I/O Immutability)

## 1. 개요 (Overview)
본 문서는 `PRD-009`에 정의된 Core 입출력 불변성 확보 의도를 기술적 계약(`B-009`)으로 연결하고, 이를 검증하기 위한 근거(Evidence)를 매핑한다.

## 2. Intent → Contract 규칙 매핑

| Intent (의도) | Contract Rule (계약 규칙) | 검증 근거 (Evidence) |
| :--- | :--- | :--- |
| **I-1. 입력 데이터 오염 방지** | B-009-2.1: Plain DTO Only | 정적 분석(TypeScript `interface` 사용), 런타임 가드 테스트 |
| **I-2. 명시적 데이터 부재 표현** | B-009-2.2: undefined 금지 | DTO 정의 내 `undefined` 타입 금지 체크, Guard Logic 테스트 |
| **I-3. 시간 데이터의 신뢰성 확보** | B-009-2.3: Timestamp 생성 책임 | `TimeProvider` 주입 여부 확인, 서비스 로직 내 `Date` 생성 코드 전수 조사 |
| **I-4. 내부 상태의 캡슐화 보호** | B-009-3.1: Output Snapshot 보장 | 출력 객체 변조 후 내부 상태 변화 확인 테스트 (Mutation Test) |
| **I-5. 부수 효과 없는 데이터 전달** | B-009-3.2: 참조 공유 금지 | Deep Copy 또는 Immutable Proxy 적용 여부 코드 리뷰 |
| **I-6. 에러 처리의 일관성 유지** | B-009-4.1: Canonical Error Only | PRD-008 에러 코드 사용 여부 Lint/TypeCheck |
| **I-7. 레이어 경계 독립성 강화** | B-009-5.0: Repository Purity | Repository 반환 타입의 DTO 여부 검사 |

## 3. 검증 전략 (Verification Strategy)

### 3.1 Type-level Enforcement
- 모든 Core 입출력은 TypeScript `interface`를 사용하여 정의하며, `class` 사용을 지양한다.
- `readonly` 수식어를 적극 활용하여 컴파일 타임에 불변성을 1차 검증한다.

### 3.2 Runtime Guard Enforcement
- Core Service 진입점에서 입력 객체에 대한 `undefined` 및 `prototype` 존재 여부를 검사하는 Guard 함수를 실행한다.

### 3.3 Test Evidence Mapping
- **Immutability Test:** 반환된 객체의 필드를 수정한 후, 동일한 데이터를 재조회했을 때 변경이 없음을 증명하는 테스트 케이스를 필수 포함한다.
- **Contract Mismatch Test:** `undefined`가 포함된 잘못된 입력이 전달될 경우 `E_CONTRACT_MISMATCH` (또는 `E_CORE_INVALID_INPUT`)가 발생하는지 검증한다.

## 4. 검증 가능성 선언 (Review Gate)

- 모든 Core 입출력 DTO가 `interface`로 정의되어 있는가?
- Core 내부에서 `new Date()`를 직접 호출하는 코드가 제거되었는가?
- 출력 데이터 반환 시 참조를 끊는 로직(Copy)이 명시적으로 존재하는가?
- 모든 실패 케이스가 `PRD-008`의 Canonical Error를 따르는가?
