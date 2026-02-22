# C-015: Chat Timeline Rendering Intent Map

## 1. User Intent → UI Behavior Mapping

| 사용자/시스템 인텐트 | 입력 (Trigger) | 매핑된 UI 동작 (Behavior) | 책임 (Ownership) |
|:--- |:--- |:--- |:--- |
| **Send Message** | 사용자 입력 전송 | 유저 말풍선 추가 및 `waiting_response` 진입 | **UI**: 즉시성 제공 |
| **Assistant Running** | `isBusy: true` 수신 | 생각 중 인디케이터 및 단계 라벨 노출 | **UI**: 상태 시각화 |
| **Assistant Completed** | (3-part structural match) | `replaying_fake_stream` 시작 | **UI**: 애니메이션 처리 |
| **Execution Failed** | `status: Failed` 수신 | 인디케이터 제거 및 에러 노출 | **UI**: 실패 알림 |

### Trigger Semantics Clarification (LOCK)
The "Assistant Completed" intent is defined strictly as:
"Detection of a new assistant message in the latest snapshot (Length Increase + Content Diff + isBusy False)."
The UI does not infer engine completion based solely on lifecycle events; it reacts only to deterministic message changes.

## 2. Non-Intent Behavior (Explicitly Forbidden)
- UI는 정책을 해석하지 않는다.
- UI는 세션을 자동으로 리셋하지 않는다.
- UI는 단계 정의를 수정하지 않는다.
- **No ID Generation**: UI MUST NOT generate artificial IDs for authoritative state tracking.

## 3. Boundary Clarification
- Phase 제어 및 Domain 판단은 서버 스냅샷에 의하며, UI는 이를 반영만 한다.

## 4. Authority Clarification (LOCK)
- UI reflects engine state.
- UI does not initiate engine state transitions or derive state from inferred user semantics.
- All authoritative transitions originate from server snapshot.
