# PRD-014: Web UI Framework Introduction

## 1. 목적 및 배경 (Purpose & Background)
- **배경**: 현재의 원시 HTML/JS 방식은 장기 기억 시각화, 멀티모달 메시지 렌더링 등 향후 요구될 복잡한 UI 대응에 한계가 있음.
- **목적**: React 프레임워크를 도입하여 UI 렌더링 레이어를 구조화하고, 상태 중심(State-driven) 개발 환경을 구축하여 WMS(재작업) 리스크를 사전에 차단함.
- **성격**: 기능 확장이 아닌 **UI 아키텍처 안정화** 단계임.

## 2. 성공 기준 (Success / DoD)
- 기존 Web Adapter(REST/SSE) 및 `GraphStateSnapshot` 계약을 유지한 채 UI 렌더링 엔진을 React로 전환 완료.
- Dev/Prod 빌드 파이프라인 분리 및 로컬 서빙 확인.
- 기존 스모크 테스트(채팅 1턴, 세션 리셋, 해시 불일치 안내) 통과.

## 3. 범위 (Scope)
### 3.1 IN SCOPE
- React/TypeScript 기반 UI 프로젝트 스캐폴딩.
- Web Adapter를 통한 정적 자산(Build Artifacts) 서빙 구조.
- `GraphStateSnapshot` 기반의 전역 상태 관리(Context/Store) 기초 수립.
- Dev 모드 전용 Overlay 레이어 설계.

### 3.2 OUT OF SCOPE
- **Core (src/core/**) 수정**: 절대 금지.
- **세션/DB 스키마 변경**: 절대 금지.
- **Full UI 구현**: 말풍선 디자인(PRD-015)이나 세션 패널(PRD-016) 상세 구현은 제외.

## 4. 리스크 및 완화책 (Risks & Mitigation)
- **리스크**: 빌드 복잡도 증가.
- **완화**: SSR(Server Side Rendering)을 배제하고 단일 포트 정적 서빙 방식을 채택하여 로컬 실행 복잡도 최소화.
- **리스크**: UI 레이어에서 Snapshot을 재해석하여 서버 권한(Server SSOT)을 침범할 가능성
- **완화**: Server SSOT 원칙과 DTO Projection Policy를 통해 UI는 상태를 "표현"만 하며, 의미적 판단 및 정책 계산은 금지

## 5. 마이그레이션 전략
1. **1단계**: 기존 HTML UI 유지 + 새로운 UI 경로(/v2) 병행 서빙.
2. **2단계**: 기능 동등성 확인 후 기본 경로(/)를 React UI로 전환.
3. **3단계**: 기존 HTML 파일 제거.

### 🔒 Build Isolation LOCK
- UI 프로젝트는 `src/core/**` 모듈을 직접 import할 수 없다.
- UI 번들에는 Core 내부 타입이 포함되어서는 안 된다.
- UI는 `GraphStateSnapshot` DTO만을 데이터 계약으로 사용한다.
- Core 타입은 Web Adapter 계층을 통해서만 간접 노출 가능하다.

### 🔒 HashMismatch UX LOCK
- UI는 HashMismatch 발생 시 세션을 자동 재생성하거나 삭제하지 않는다.
- 세션 무결성 판단 및 복구 전략은 전적으로 Server SSOT의 책임이다.
- UI는 오직 안내 메시지를 표시하고 사용자 명시적 입력만 전달한다.

### 🔒 Policy Interpretation LOCK
- UI는 Step 순서, 정책 해석, Phase 정규화 로직을 재계산하지 않는다.
- UI는 서버에서 전달된 결과를 그대로 시각화(Projection)한다.
- Canonical ordering, validation, normalization은 Server 책임이다.

---
**Core 영향 0 선언**: 본 작업은 UI 렌더링 어댑터 내부의 기술 스택 교체일 뿐이며, Core 런타임 로직에 어떠한 사이드 이펙트도 주지 않음을 명시함.
