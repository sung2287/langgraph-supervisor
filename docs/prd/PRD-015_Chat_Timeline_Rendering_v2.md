# PRD-015: Chat Timeline Rendering v2 (Fake Streaming + Thinking Indicator)

## 1. Summary
본 문서는 Phase 6A (Chat-First UX Stabilization)의 일환으로, 기존의 원시 JSON 출력 방식을 사용자 친화적인 채팅 타임라인 UI로 전환하기 위한 설계 요구사항을 정의한다. 본 PRD는 실제 토큰 스트리밍 구현 없이, UI 레이어의 애니메이션(Fake Streaming)과 상태 표시기(Thinking Indicator)를 통해 사용자 경험을 고도화하는 데 집중한다.

## 2. Context
- **현상태**: PRD-001~013 완료. 웹 어댑터를 통해 `GraphStateSnapshot`을 SSE(Server-Sent Events)로 수신 중이나, 가독성이 낮음.
- **기반 데이터**: 
    - `GraphStateSnapshot.history`: 전체 대화 이력 (SSOT).
    - `GraphStateSnapshot.isBusy`: 엔진 실행 중 여부.
    - `GraphStateSnapshot.currentStepLabel`: 현재 실행 중인 단계의 명칭.

## 3. Structural Guardrails (LOCK)
시스템의 무결성 유지를 위해 다음 제약 사항을 엄격히 준수한다.
- **Core-Zero-Mod**: `src/core/**` 내의 모든 코드는 수정을 금지한다.
- **No Contract Change**: Step Contract 및 기존 DTO 스키마를 변경하지 않는다.
- **Server as SSOT**: 서버에서 내려주는 `history`가 최종 권위(Authority)를 가지며, UI는 이를 투영(Projection)할 뿐이다.
- **No Authoritative Accumulation**: UI는 로컬에서 독자적인 토큰 축적 로직을 가지지 않는다.
- **No Logic Leakage**: UI는 정책(Policy)을 해석하거나 Step ID를 직접 매핑하지 않는다. DTO에 포함된 `currentStepLabel`을 그대로 렌더링한다.

## 4. Goals
1. **Chat Bubble UI**: 대화 이력을 사용자(User)와 어시스턴트(Assistant)가 구분된 말풍선 형태로 렌더링한다.
2. **Thinking Indicator**: 서버가 실행 중(`isBusy === true`)일 때 애니메이션 처리된 생각 중 표시("…")를 제공한다.
3. **Fake Streaming**: 어시스턴트 응답이 완료되어 전달되었을 때, UI 레이어에서 글자 단위로 순차적으로 노출하여 실제 스트리밍되는 듯한 시각적 효과를 부여한다.
4. **Deterministic Sync**: 애니메이션 도중이나 종료 후, 서버 상태와의 데이터 불일치(Drift)가 발생하지 않도록 확정적 동기화를 보장한다.

## 5. Non-Goals
- Real Token Streaming, AsyncIterator 도입, 세션 자동 리셋, UI 내 정책 해석.

## 6. UX Flow
상태 전이는 DTO의 필드 변화에 따라 결정론적으로 발생한다.
1. **State A: Idle**: `isBusy === false`. 사용자 입력을 대기한다.
2. **State B: Waiting (Thinking)**: `isBusy === true`로 변경됨.
3. **State C: Replaying (Fake Stream)**: 서버 응답 도착 후 애니메이션 실행.
4. **State D: Done**: 서버 데이터와 100% 일치 및 Idle 복귀.

## 7. Fake Streaming Spec

### Replay Trigger Rule (STRICT LOCK)
Replay MUST execute only when ALL conditions are satisfied:
1. `prevSnapshot.history.length < currentSnapshot.history.length`
2. 마지막 assistant 메시지 내용이 이전 스냅샷과 구조적으로 다름
3. `currentSnapshot.isBusy === false`

Replay MUST NOT be triggered solely by `isBusy` transition.

### Mechanism (LOCK)
The replay effect MUST operate on a transient rendering layer only.
UI MUST NOT:
- clone and mutate canonical history
- append synthetic assistant messages
- replace history reference
- persist animation progress to session storage

All animation state MUST remain volatile and local to the React component.

- **Chunking**: 개별 글자 단위보다 단어/청크 단위 노출을 권장한다.
- **Duration Cap**: 전체 재생 시간은 최대 1500ms~2000ms를 초과하지 않도록 보정한다.
- **Safety**: 재생 중 내용이 변경되거나 강제 리셋이 감지되면 즉시 애니메이션을 중단하고 서버 데이터로 동기화한다.

## 8. No Client Identity Rule (LOCK)
- UI MUST NOT generate or persist artificial message IDs for authoritative comparison.
- Virtual keys MAY be used only for React rendering stability.
- Message identity comparison MUST rely exclusively on structural snapshot comparison (length + content).

## 9. Busy Indicator Determinism (LOCK)
Thinking Indicator MUST render only when:
- `snapshot.isBusy === true`
- AND the last item in `snapshot.history` has role `"user"`

Client timers or speculative states are forbidden.

## 10. DTO Boundary
- UI 프로젝트는 `src/core` 타입을 직접 참조하지 않으며 `runtime/web/mapper.ts` 레이어를 경유한다.

## 11. Definition of Done (DoD)
- [ ] 말풍선 기반 채팅 UI가 JSON 뷰를 완전히 대체함.
- [ ] Replay does not re-trigger on duplicate SSE emissions.
- [ ] Snapshot overwrite during replay correctly aborts animation.
- [ ] No artificial IDs used for authoritative comparison.
- [ ] Snapshot.history reference remains immutable throughout lifecycle.

## 12. Convergence Guarantee (LOCK)
After replay completion, the UI-rendered content MUST be byte-for-byte identical to the assistant message content contained in the latest server snapshot.

### Drift Hard Stop (LOCK)
If during replay the server snapshot changes (new snapshot received), the UI MUST immediately abort replay and synchronize to the latest snapshot.

---
**Design Rejection Required**: `isBusy` 관리를 위해 `session_state`에 플래그를 추가하거나 Core 엔진을 수정하려는 모든 설계는 규정 위반으로 간주됨.
