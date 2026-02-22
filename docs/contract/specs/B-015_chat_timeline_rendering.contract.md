# B-015: Chat Timeline Rendering Contract

## 1. UI State Contract
UI는 서버로부터 수신한 `GraphStateSnapshot`의 필드 변화에 따라 다음 상태 머신을 결정론적으로 유지해야 한다.

### States:
- **idle**: `snapshot.isBusy === false` 및 스트림 재생이 완료된 상태.
- **waiting_response**: `snapshot.isBusy === true`로 전환된 상태.
- **replaying_fake_stream**: `isBusy`가 `false`이나 신규 메시지의 시각적 노출이 진행 중인 상태.
- **done**: 애니메이션 종료 및 최종 데이터 동기화 상태.

### Transition Rules:
- 상태 전이는 오직 `isBusy`, `history` 길이 변화, `status` (Running/Failed)에 의해서만 트리거된다.
- **Replay Idempotency Rule (LOCK)**: Replay MUST execute only once per assistant message. Repeated SSE emissions containing identical assistant content MUST NOT re-trigger replay. Triggering MUST depend on message identity comparison (structural comparison), not solely on `isBusy`.

## 2. Fake Streaming Contract

### Trigger Condition (LOCK)
Replay MUST execute only when ALL conditions are satisfied:
1. `prevSnapshot.history.length < currentSnapshot.history.length`
2. 마지막 assistant 메시지 내용이 이전 스냅샷과 구조적으로 다름
3. `currentSnapshot.isBusy === false`

### Replay Rules:
- **Visual Overlay**: 재생 로직은 오직 일시적인 시각 레이어에서 작동한다.
- **Convergence**: 애니메이션 종료 시 텍스트는 서버 원문과 반드시 일치해야 한다.
- **Duration Cap**: 최대 재생 시간은 2000ms로 제한한다.

### Safety Rules:
- **Deterministic History Comparison (LOCK)**: History comparison MUST be structural (length + content equality). Reference equality (object identity) MUST NOT be used as the sole basis for replay decisions.
- **Drift Hard Stop Rule (LOCK)**: If a new snapshot is received during replay, the UI MUST immediately abort the animation and synchronize to the new authoritative state.

## 3. Thinking Indicator Contract
- **Trigger**: `isBusy === true` AND last message role === `"user"`.
- **Behavior**: Render placeholder with animated ellipsis. Remove when assistant message appears.
- **Failure Behavior**: If `status === "Failed"`, hide indicator and show error banner.

### Single Active Response Cycle (LOCK)
Only one response cycle may exist at a time. If a new user message is submitted while replay is active, the current replay MUST abort immediately, and the state MUST transition to `waiting_response`.

## 4. SSOT Rule (LOCK)
- **Authority**: `GraphStateSnapshot.history`가 유일한 권위 소스다.
- **No Mutation**: UI는 Canonical history 배열을 복제, 수정, 교체할 수 없다.
- **No Artificial IDs**: UI MUST NOT generate or use client-side IDs for authoritative state comparison.

## 5. Convergence Guarantee (LOCK)
After replay completion, the rendered assistant content MUST be byte-for-byte identical to the content contained in the latest server snapshot. If any divergence is detected, the UI MUST immediately synchronize to the snapshot.
