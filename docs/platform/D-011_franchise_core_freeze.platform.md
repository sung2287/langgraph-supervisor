# D-011: Franchise Core Freeze (Platform)

## 1. 목적 (Implementation Goal)
본 문서는 `PRD-011` 및 `B-011` 선언을 플랫폼 운영의 표준으로 정의하여, Core 영역이 시스템의 안정적 기준선(Baseline)으로 작동하게 하는 것을 목적으로 한다.

## 2. 운영 정의 (Operational Definition)

### 2.1 Freeze 상태의 의미
- **Baseline Mapping:** `src/core/*` 하위의 모든 코드는 시스템의 "본점 기준선"으로 관리된다.
- **Procedural Enforcement:** 코드 수준의 기술적 제약보다 프로세스 수준의 제도적 제약을 우선한다.

### 2.2 거버넌스 연계
- Core 영역에 대한 모든 변경은 `PRD-010 (Core 최소 테스트 존재 규칙 및 승인 흐름 고정)`을 전제 조건으로 삼는다.
- Freeze 상태 하에서 변경은 "테스트 통과 + Reviewer 승인 + PRD 근거"가 결합된 공식 절차에 따라 수행된다.

## 3. 변경 워크플로우 (Change Workflow)

Freeze 선언 이후 Core 변경은 반드시 다음 표준 흐름을 따른다.

1. **PRD 작성:** 변경의 필요성과 영향도를 정의하는 PRD 생성.
2. **Contract 갱신:** 필요한 경우 B/C/D 문서의 수정을 동반.
3. **구현 및 테스트:** `PRD-010`에 따라 최소 1개 이상의 테스트 포함.
4. **명시적 승인:** Reviewer의 APPROVED 판정 획득.
5. **승격 및 병합:** `prd:close` 및 `state` 승격 절차 수행 후 `main` 반영.

## 4. 확장 영역 가이드 (Expansion Guide)

### 4.1 Core 외부 확장
신규 기능이나 제품별 특화 로직은 다음 영역에서 우선적으로 구현한다.
- `src/adapter/*`
- 상위 Composition 레이어
- 개별 도메인 확장 모듈

### 4.2 Core 편입 프로세스
확장 영역에서 검증된 로직 중 시스템 공통 규칙으로 격상이 필요한 경우, 별도의 PRD를 통해 Core 본점으로의 편입을 결정한다.

## 5. 비목표 (Non-Goals)
- **기술적 Lock 구현:** 파일 시스템 권한이나 git hooks 등을 통한 물리적 잠금은 구현하지 않는다.
- **자동화 기반 Drift 감지:** 본 단계에서는 자동화된 Drift 판정 시스템을 도입하지 않는다.
- **레거시 강제 리팩토링:** Freeze 시점 이전의 기존 코드를 즉시 수정할 의무를 부여하지 않는다.

---
**Baseline Version:** 1.0
**Compliance:** MANDATORY (Process-based)
