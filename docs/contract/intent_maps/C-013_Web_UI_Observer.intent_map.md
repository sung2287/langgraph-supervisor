# C-013: Web UI Observer Intent Map

## 1. 개요 (Overview)
사용자의 웹 인터페이스 조작 요청(`intent`)이 웹 어댑터와 런타임 사이에서 어떻게 처리되는지 정의한다. 

## 2. 인텐트 매핑 (Intent Mapping)

### 2.1 Intent: Submit Web Input
- **발생 지점**: Web UI 입력창 ("Send" 클릭).
- **매핑된 동작**: Web UI 입력은 Runtime Orchestrator를 경유하여 실행 요청을 전달한다.
- **결과**: 엔진 실행 트리거 및 `GraphState` 갱신.

### 2.2 Intent: Refresh State Observer
- **발생 지점**: Web UI 상태 폴링 또는 이벤트 수신 시점.
- **매핑된 동작**: `IWebRuntimeAdapter.getCurrentState()` 호출.
- **결과**: UI 상의 모드, 도메인, 단계 표시 최신화.

### 2.3 Intent: Web Session Reset
- **발행 지점**: "Session Reset" 버튼 클릭.
- **매핑된 동작**: 세션 초기화는 Runtime Orchestrator의 세션 로테이션 정책에 위임한다.
- **결과**: `session_state.web.<sessionId>.json` 파일 로테이션 및 새 세션 시작.

## 3. 예외 매핑 (Exception Mapping)

| Intent | 에러 조건 | 결과 인텐트 (Fail-Fast) |
|:---|:---|:---|
| Submit Input | 해시 불일치 (HashMismatch) | `abort_with_guide(web_session_expired_confirm)` |
| Refresh State | 연결 실패 (ConnectionLost) | `ui_update(offline_status)` |
| Reset Session | 파일 권한 에러 (WriteDenied) | `abort_with_error(session_rotation_failed)` |

## 4. 제약 사항 (Constraints)
- **Non-blocking Progress**: UI 상의 진행률 표시바(Progress Bar)는 엔진의 각 단계를 시각적으로만 반영하며, 실제 실행 속도를 제어하지 않는다.
- **Single-Writer Enforcement**: 파일 시스템 레벨 Lock은 사용하지 않는다. 동일 세션에 대한 동시 실행은 Runtime Adapter의 프로세스 메모리 기반 `in-flight guard`로만 제어한다. 멀티 프로세스/분산 환경 락은 v1 범위 밖이다.

---
**RED FLAG**: 웹 어댑터가 `src/core/plan/executor.ts`의 `ExecutionPlan`을 직접 수정하여 특정 단계를 비활성화(Skip)하려는 인텐트 설계는 원칙 위반임.
