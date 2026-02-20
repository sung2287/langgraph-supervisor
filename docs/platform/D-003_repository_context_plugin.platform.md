# D-003_repository_context_plugin.platform.md

## 1. Execution Impact
- **Runtime 영향:** `executionPlan`에 포함된 경우 실행 시간이 증가할 수 있으나, 스냅샷 재사용 시 영향은 미비하다.
- **Session State:** 현재 세션에서 사용 중인 스냅샷의 버전 정보(`scanVersion`)가 컨텍스트에 포함된다.
- **저장소 구조:** 대상 저장소는 변경되지 않으며, `ops/runtime/scan-result.json`이 생성된다.
- **Core Decoupling:** Core Engine does not contain any static reference to the repository plugin. Plugin invocation is entirely driven by `executionPlan` resolution.

## 2. Required Files
- **New Files:**
  - `src/plugin/repository/scanner.ts`: 스캔 및 인덱싱 로직.
  - `src/plugin/repository/snapshot_manager.ts`: 스냅샷 저장 및 재사용 관리.
- **Modified Files:**
  - `policy/profiles/*/modes.yaml`: 특정 모드(예: IMPLEMENT)의 `executionPlan`에 스캔 단계 추가.
- **Location:**
  - Artifacts: `ops/runtime/scan-result.json`

## 3. Runtime Compliance Check
- **RUNTIME.md:** "External Repo READ-ONLY" 원칙 준수 여부 확인.
- **package.json:** 스캔 전용 스크립트(예: `npm run scan`)는 선택 사항이며, 기본 `run:local` 내에서 정책에 따라 실행된다.
- **prd:close:** `prd:close` 시 해당 PRD와 관련된 임시 스냅샷 데이터를 정리할지 여부를 정책에 따라 결정한다.

## 4. Operational Notes
- **Sandbox → Core 승격:** 이 PRD는 기능 PRD이며, ExecutionPlan에 새로운 단계 유형을 추가하는 구조적 변경을 포함하므로 샌드박스 검증 후 Core로 승격되어야 한다.
- **Operational Classification:** 기능 PRD.
- **Audit:** 대규모 저장소 스캔 시 성능 병목이 발생할 수 있으므로, 주기적인 `summaryCache` 효율성 감사가 필요하다.
