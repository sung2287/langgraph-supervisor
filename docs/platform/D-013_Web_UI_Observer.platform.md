# D-013_Web_UI_Observer_Platform

## 1. 개요 (Overview)
본 문서는 웹 UI 어댑터의 물리적 환경과 세션 관리 정책을 정의한다. 

## 2. 웹 서버 및 통신 (Web Server & Communication)

| 항목 | 규격 (Specification) | 설명 (Description) |
|:---|:---|:---|
| **기본 포트** | `3000` (설정 가능) | 웹 인터페이스 접속 포트. |
| **통신 방식** | `REST API` + `Server-Sent Events (SSE)` | 실시간 상태 업데이트를 위한 SSE 권장. |
| **어댑터 위치** | `src/adapters/web/` | 웹 요청을 처리하고 런타임을 호출하는 어댑터 로직 위치. |

- **Security Note**: 로컬 호스트(`localhost`) 전용 접속을 기본값으로 하며, 외부 접속 허용 시 시크릿 프로파일 노출 위험성을 경고한다. 

## 3. 웹 세션 관리 (Web Session Management)

| 항목 | 정책 (Policy) | 설명 (Description) |
|:---|:---|:---|
| **파일명** | `session_state.web.<name>.json` | `<name>`은 URL 파라미터나 입력값으로 지정. |
| **저장 위치** | FileSessionStore의 기본 경로 정책을 따른다. | CLI 세션과 동일한 경로에 저장하되 명칭으로 구분. |
| **로테이션** | 10개 (FIFO) | `_bak/` 폴더 내에 웹 세션 백업 파일 유지. |

- **Concurrency Control**: 동일 네임스페이스에 대한 동시 요청은 프로세스 메모리 기반 in-flight guard로 제어한다. 실행 중일 경우 후속 요청은 거부되거나 큐에 적재하며, 기존 작업을 덮어쓰지 않는다. 
  - **Scope Limit**: 본 메커니즘은 단일 런타임 프로세스 내에서만 보장되며, 분산 서버 환경은 고려하지 않는다.

## 4. UI 렌더링 가이드라인 (Rendering Guidelines)
- **Active Context Display**: 상단 바에 현재 `Mode`, `Domain`, `Provider`, `Model`, `Secret Profile`을 아이콘과 함께 상시 표시. 
- **Step Visualization**: 
  - 현재 실행 중인 단계를 진행률 바(Progress Bar)나 리스트 형태로 표시. 
  - 각 단계의 성공/실패 여부를 색상(Green/Red)으로 구분. 
- **Non-blocking Input**: 엔진 실행 중에도 새로운 입력을 받을 수 있는 UI 구성을 하되, 실행 중일 때는 입력창을 비활성화(Read-only) 처리한다. 

## 5. 제약 사항 (Constraints)
- **No-Static-Asset-Injection**: 엔진 내부 로직에서 웹 자원(HTML/CSS/JS)을 직접 관리하지 않으며, 어댑터가 이를 분리하여 서비스한다. 
- **Fail-Fast for Web**: 웹 환경에서도 해시 불일치나 시크릿 오류 발생 시, 엔진의 `Abort` 메시지를 가공 없이 그대로 출력하여 일관성을 유지한다. 

---
**RED FLAG**: 웹 어댑터가 런타임을 통하지 않고 `src/core/session/store.ts`를 직접 호출하여 세션을 강제 수정하거나 삭제하려는 행위는 무결성 훼손으로 금지됨. 
