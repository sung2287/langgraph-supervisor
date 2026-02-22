# C-014: Web UI Framework Introduction Intent Map

## 1. 개요 (Overview)
React 프레임워크 내에서 발생하는 주요 인텐트가 런타임과 어떻게 상호작용하는지 정의한다.

## 2. 인텐트 매핑 (Intent Mapping)

| 사용자 인텐트 (Intent) | 매핑된 동작 (Mapping) | 결과 및 책임 (Result / Ownership) |
|:--- |:--- |:--- |
| **Render Timeline** | SSE 스트림 수신 → React State 업데이트 | **UI**: DTO 수신 및 컴포넌트 리렌더링 |
| **Execute Command** | REST API 호출 (input/reset) | **Server**: 실행 후 결과 Snapshot 반환 |
| **Toggle Dev Overlay**| UI 내부 `isDev` 플래그 전환 | **UI**: 서버 메타데이터 가시성 제어 (Client-only) |
| **Session Switch** | URL 파라미터 또는 세션 API 호출 | **Server**: SSOT 세션 로드 및 해시 검증 수행 |
| **Render Message Type** | Snapshot 내 message.type 기반 분기 렌더 | **UI**: 타입별 시각화만 수행하며, 의미 해석 또는 정책 판단은 수행하지 않음 |

## 3. DTO Isolation Intent
- **Projection Policy**: UI는 서버로부터 받은 Snapshot을 "그대로" 그리거나 가공하되, 서버 상태를 유추하여 로컬에서 독자적인 상태(State)를 파생(Derive)하지 않는다.
- **Single Entry**: 모든 실행 요청은 `runRuntimeOnce`와 연결된 통합 엔드포인트를 통해서만 인입된다.
