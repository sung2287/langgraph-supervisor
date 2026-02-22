# C-012: Override UX Intent Map

## 1. 개요 (Overview)
사용자의 프로바이더 및 모델 오버라이드 요청(`intent`)이 런타임 어댑터와 엔진 사이에서 어떻게 처리되는지 정의한다. 

## 2. 인텐트 매핑 (Intent Mapping)

### 2.1 Intent: Override Provider/Model
- **발생 지점**: CLI (`--provider`, `--model`), Web UI (Dropdown).
- **매핑된 동작**: 어댑터의 `RuntimeOverrideOptions` 객체 생성.
- **결과**: `ExecutionContext`에 오버라이드된 프로바이더/모델 정보 주입.

### 2.2 Intent: Validate Hash with Override
- **발생 지점**: 런타임 초기화 단계.
- **매핑된 동작**: 기존 세션 파일(session_state*.json)을 로드한 후 `Plan Hash` 비교. (CLI 및 Web 네임스페이스 모두 포함)
- **결과**:
  - `HashMatch`: 세션 복구 및 실행 계속.
  - `HashMismatch`: `abort_with_guide(hash_mismatch_restart_required)`.
- **가이드 내용**: 
  - HashMismatch는 자동 복구가 아닌 Fail-Fast 중단이다.
  - 해결책으로 `--fresh-session` 또는 새로운 네임스페이스(`--session`) 재실행을 안내한다.
  - `--fresh-session` 호출 시 기존 파일은 `_bak` 폴더로 백업 보존(Rename)된 후 새 세션이 생성됨을 명시한다.

## 3. 예외 매핑 (Exception Mapping)

| Intent | 에러 조건 | 결과 인텐트 (Fail-Fast) |
|:---|:---|:---|
| Override | 지원하지 않는 모델 | `abort_with_error(model_not_supported)` |
| Override | 잘못된 프로바이더 | `abort_with_error(provider_not_found)` |
| Validate | 해시 불일치 | `abort_with_guide(hash_mismatch_restart_required)` |

## 4. 제약 사항 (Constraints)
- **Non-blocking Rendering**: UI 상에서 오버라이드 선택 시 즉시 실행을 막지 않으며, 실행 단계 진입 시점에만 해시 검증을 수행한다.
- **Single-Writer Policy**: 세션 저장은 write-in-place(직접 덮어쓰기)를 금지하며, temp write → rename 기반의 원자적 교체 방식 및 `FileSessionStore`의 로테이션 정책에 위임한다.

---
**RED FLAG**: 어댑터에서 `Policy` 파일을 직접 수정하여 오버라이드를 구현하려는 설계는 원칙적으로 금지된다. 정책은 읽기 전용이며, 오버라이드는 실행 시점의 임시 설정이어야 한다.
