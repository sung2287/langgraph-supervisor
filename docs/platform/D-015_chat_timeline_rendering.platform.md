# D-015: Chat Timeline Rendering Platform

## 1. Technical Layer Scope
- **Allowed**: `src/adapters/web/ui/**`, `runtime/web/mapper.ts`.
- **Forbidden**: `src/core/**`, `LLMClientPort` interface, `session_state` schema.

## 2. DTO Usage
- UI는 오직 `GraphStateSnapshot`을 소비하며, `src/core` 타입을 직접 참조하지 않는다.
- 단계 라벨은 DTO의 `currentStepLabel` 필드 값만을 사용한다.

## 3. Rendering Strategy
- **Stable Identity Rule (LOCK)**: 메시지 컴포넌트는 스냅샷 데이터로부터 유도된 결정론적 key(예: index 또는 content hash)를 사용해야 한다. 애니메이션 중 key 불안정으로 인한 리마운트(Re-mount)가 발생해서는 안 된다.
- **Volatility Rule (LOCK)**: 애니메이션 진행 상태(substring index 등)는 오직 React 컴포넌트의 로컬 상태(useState)로만 관리하며 세션 저장소 영속화를 금지한다.
- **Chunk-based Animation**: 가독성을 위해 단어/청크 단위 노출을 권장한다.

## 4. Forward Compatibility Note
- 실제 스트리밍 도입 시, 이는 Adapter 레벨의 사이드 채널을 통해 구현되어야 한다.
- 메시지 모델은 향후 메타데이터 확장이 가능하도록 개방적인 구조를 유지한다.
