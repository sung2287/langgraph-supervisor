# B-008: Canonical Error System Freeze (Contract)

## 1. 개요 (Overview)
본 Contract는 `PRD-008: Canonical Error System Freeze`에 기반하여, 시스템 전체의 에러 체계를 단일 Canonical System으로 봉인하고, 레이어 간의 정합성(Alignment)을 기술적으로 보장하기 위한 계약이다.

## 2. Canonical ErrorCode Set (LOCKED)

ErrorCode는 다음의 닫힌 집합(Closed Set)으로 구성되며, 시스템 내 모든 레이어는 이 집합 내의 코드만을 사용하여 실패를 표현해야 한다.

### 2.1 Core Origin Codes
- `E_CORE_INVALID_INPUT`: 입력 값의 도메인 규칙 위반
- `E_CORE_STATE_VIOLATION`: 시스템 상태가 요청을 수행할 수 없는 조건
- `E_CORE_INVARIANT_BROKEN`: 불변식이 깨진 상태 (데이터 무결성 오류 등)
- `E_CONTRACT_MISMATCH`: 레이어 간 인터페이스 계약 위반

### 2.2 Adapter Origin Codes
- `E_ADAPTER_VALIDATION`: 외부 입력의 형식/구조적 검증 실패 (Syntax Error)

### 2.3 System Fallback Code
- `E_INTERNAL_ERROR`: 정의되지 않은 예외, 인프라 장애, 최후의 Fallback

## 3. 에러 정책 메타데이터 (Metadata)

에러 코드는 반드시 다음 메타데이터와 결합되어야 한다. 이 메타데이터의 정의 권한은 **Canonical System(SSOT)**에 있으며, Adapter는 이를 해석하여 외부 응답으로 변환한다.

| ErrorCode | PublicMessage (Y/N) | HTTP Status | CLI Exit | Retryable |
| :--- | :--- | :--- | :--- | :--- |
| E_CORE_INVALID_INPUT | Y | 400 | 1 | N |
| E_CORE_STATE_VIOLATION | N | 409 | 1 | N |
| E_CORE_INVARIANT_BROKEN | N | 500 | 1 | N |
| E_CONTRACT_MISMATCH | N | 500 | 1 | N |
| E_ADAPTER_VALIDATION | Y | 400 | 1 | N |
| E_INTERNAL_ERROR | N | 500 | 1 | Y/N (Default N) |

## 4. 레이어별 제약 사항 (Constraints)

### 4.1 Core Layer
- Core는 `E_CORE_*` 및 `E_CONTRACT_MISMATCH`만 생성할 수 있다.
- Core는 에러 메시지에 사용자 친화적인(UX) 텍스트를 담지 않는다.
- Core는 에러 정책 메타데이터(HTTP Status 등)를 참조하거나 의존할 수 없다.

### 4.2 Adapter Layer
- Adapter는 모든 Core Error를 예외 없이 매핑해야 한다 (Exhaustive Mapping).
- Adapter에서 발생하는 기술적 실패(Parsing Error 등)는 `E_ADAPTER_VALIDATION`을 사용한다.
- 명시적으로 매핑되지 않은 모든 예외는 `E_INTERNAL_ERROR`로 수렴시켜야 한다.

## 5. Drift 방지 및 고정 (Freeze)

### 5.1 Drift 정의
- Core에 정의된 ErrorCode가 Adapter 매핑 테이블에 존재하지 않는 경우.
- SSOT에 정의되지 않은 ErrorCode 문자열이 코드베이스에 존재하는 경우.
- 에러 정책 메타데이터가 승인 없이 변경된 경우.

### 5.2 Drift HOLD 조건
- **CI/CD 파이프라인 중단:** 정적 분석 혹은 타입 검사 단계에서 위 Drift 감지 시 즉시 빌드를 중단한다.
- **Human Review 필수:** ErrorCode의 추가/삭제/변경은 반드시 `PRD-008` 개정 및 수동 승인을 거쳐야 한다.

## 6. PRD-004/006과의 관계 (Conflict Resolution)
- 본 문서는 PRD-004 및 PRD-006의 에러 관련 내용을 대체하며, 상충 시 본 문서를 우선한다.
- `E_SANDBOX_EXECUTION_FAILED`는 `E_INTERNAL_ERROR` 또는 `E_CORE_STATE_VIOLATION` 중 성격에 맞는 코드로 흡수 통합한다.
