# PROJECT_STATE (AI Context)
# Rules: Do not add/remove sections. Only update values. Keep concise.

## Meta
- project: 저작관리시스템
- state_version: 2
- last_updated: 2026-02-22
- updated_by: human
- update_reason: close prd-015
- latest_delta_id: 20260222_113315_66126004
- git_base: origin/main
- git_merge_base: f7686c488ae1d12bf2419d5b7bee2378c3c6df7c
- git_head: dee88d1dd54087a09fb7475a17a96923b6cd10b3
- git_head_short: dee88d1
- git_branch: prd-015-chat-timeline-rendering
- changed_files_sha256: 77b49f0498e241947fa2cdce940626d09568571ded17d73dd44ff8b178bc590b
- typecheck_exit_code: 0
- test_exit_code: 0

## Purpose
- one_liner: 테스트 통제로 개발 의도를 고정하는 저작 시스템

## Non-Goals (Hard No)
- ui:
  - Core-level UI implementation: NO (Hard No)
  - Business logic migration to UI: NO (Hard No)
  - Adapter-level UI (Observer / Rendering only): ALLOWED
  - UI must respect:
      - Core-Zero-Mod
      - DTO Isolation
      - Server as SSOT
      - No runtime contract modification
- auth: NO
- web_api: NO (Adapter PRD 전까지)
- db_persistence: NO

### Clarification — UI Governance Boundary
The prohibition of "UI" applies strictly to:
- Embedding UI concerns inside src/core/**
- Allowing client-side authority over session, policy, or decision logic

Adapter-level UI (Web Observer / React Rendering Layer)
is permitted as long as it remains:
- Projection-only (DTO-based)
- Server-authoritative
- Non-intrusive to Core runtime logic
- Fully isolated from business rule execution

This clarification formalizes PRD-013 and Phase 6A alignment.

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
- prd_done: [PRD-002, PRD-001, PRD-003, PRD-004, PRD-007, prd-006, prd-005, prd-009, prd-008, PRD-010, PRD-011, prd-012a, PRD-012, prd-013, prd-014, prd-015]
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
