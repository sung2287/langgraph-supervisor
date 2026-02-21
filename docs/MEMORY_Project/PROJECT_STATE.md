# PROJECT_STATE (AI Context)
# Rules: Do not add/remove sections. Only update values. Keep concise.

## Meta
- project: 저작관리시스템
- state_version: 2
- last_updated: 2026-02-21
- updated_by: human
- update_reason: close prd-005
- latest_delta_id: 20260221_094148_8edf5ab1
- git_base: origin/main
- git_merge_base: 2582a60366b89e31a38fe7e24eeb42ede2ad367c
- git_head: 6eeb71cb1919dfed475a3741d70ec39250d69d01
- git_head_short: 6eeb71c
- git_branch: main
- changed_files_sha256: ea73b65f561582330b00ed63b2e82ad24627cd0c4c3fe60ea6ec21bffbcae019
- typecheck_exit_code: 0
- test_exit_code: 0

## Purpose
- one_liner: 테스트 통제로 개발 의도를 고정하는 저작 시스템

## Non-Goals (Hard No)
- ui: NO
- auth: NO
- web_api: NO (Adapter PRD 전까지)
- db_persistence: NO

## Locked Principles
- sandbox_first: YES
- contract_first: YES
- core_cannot_reference_sandbox_or_archive: YES
- tests_required: YES (CI signal + Code Owner approval enforced)
- core_error_policy_result_based: YES (throw 금지)

## Architecture Snapshot
- language_runtime: TypeScript / Node
- process: PRD → Contract → Intent → Platform → sandbox → core
- naming_rule: ABCD File Naming (LOCKED)

## Current Scope (Approved/Done)
- prd_done: [PRD-002, PRD-001, PRD-003, PRD-004, PRD-007, prd-006, prd-005]
- core_promoted:
  - PRD-001 (Create)
- core_status: Partial; non-TOC core files removed during cleanup, recovery in progress

## Build & Test Status (Latest Known)
- typecheck: PASS
- test: PASS
- notes: CI는 최소검진(typecheck/test) 신호, 정책 차단은 브랜치 보호/CODEOWNERS

## Next Options (Not Decisions)
- candidate_prds: [PRD-002, PRD-003, PRD-004, PRD-005, PRD-006, PRD-007]
- open_questions:
  - Reintroduce PRD-002+ via Gate-compliant tests first
  - Restore state reporting automation (state_* scripts)
  - Decide minimal WIP commit policy for memory documents

## Constraints / Risks (AI-relevant only)
- 테스트 변경은 Code Owners 승인 없이는 merge 불가 (완료/immutable 결정은 Human)
- 복구 단계에서는 문서/메모 우선, 코드 복구는 마지막
- 정리되지 않은 메모라도 Git에 즉시 커밋 필요
