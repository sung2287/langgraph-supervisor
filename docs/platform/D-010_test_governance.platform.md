# D-010: Core Test Governance (Platform)

## 1. 목적 (Implementation Goal)
본 문서는 `PRD-010` 및 `B-010` 계약을 플랫폼의 운영 원칙으로 정의하여 Core 영역의 거버넌스를 유지하는 것을 목적으로 한다.

## 2. 운영 원칙 (Operating Principles)

### 2.1 승인 흐름
Core 영역의 변경은 Reviewer의 수동 승인을 최종 권한으로 한다.
- 테스트 PASS 확인
- Reviewer 명시적 APPROVED 판정
- 승인 기록 보존

### 2.2 비소급 적용 관리
기존 main에 존재하는 코드는 본 규칙의 적용 대상에서 제외되며, 현재 상태를 유지한다.

## 3. 금지 및 허용 경로 (Enforcement)

### 3.1 금지 경로 (FORBIDDEN)
- **Unapproved Merge:** Reviewer 승인 없이 Core 변경을 병합하는 행위.
- **Test-less Entry:** 테스트가 존재하지 않는 Core 변경을 승격시키는 행위.
- **Silent Deletion:** 사유 기록 없이 Core 테스트를 제거하는 행위.

### 3.2 허용 경로 (ALLOWED)
- **Core 외부 영역:** Core 외부 영역의 변경은 본 규칙의 강제 적용 대상이 아님.
- **사유 기반 수정:** 명확한 사유와 승인이 동반된 테스트 수정 및 제거.

## 4. 비목표 (Non-Goals)
- **기존 테스트 전수 점검:** 과거 코드의 테스트 수준을 평가하지 않음.
- **자동화 시스템 도입:** CI 자동 차단 로직이나 자동화 스크립트를 추가하지 않음.
- **품질 정량 평가:** 테스트의 품질이나 커버리지 수치를 강제하지 않음.

---
**Baseline Version:** 1.1
