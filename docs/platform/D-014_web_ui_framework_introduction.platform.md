# D-014: Web UI Framework Platform

## 1. 디렉토리 구조 및 배치
- **UI Source**: `src/adapters/web/ui/` (React/TS 소스 위치).
- **Build Output**: `dist/ui/` 또는 `src/adapters/web/public/`.
- **Serving**: Web Adapter(Express/Fastify 등)가 정적 파일 서빙 미들웨어를 통해 UI를 제공한다.

## 2. 개발 및 빌드 흐름
- **Local Dev**: React 개발 서버(Vite 등)가 별도 포트에서 실행될 수 있으나, API 요청은 Web Adapter 포트로 프록시(Proxy) 처리한다.
- **Production**: UI 빌드 결과물이 런타임 서버 패키지에 포함되어 단일 포트로 서비스된다. (CORS 이슈 및 배포 복잡도 제거)

## 3. 연결 방식 (Connection Strategy)
- **Single-Port Serving**: 런타임 서버와 UI를 동일 포트에서 제공하는 정적 서빙 방식을 권장함. 
- **Rationale**: 로컬 환경에서의 포트 충돌 방지 및 사용자의 "단일 실행 파일" 경험 유지.

## 4. 변경 영향 범위 (Impact Area)
- **영향 있음**: `runtime/web/`, `src/adapters/web/`, `ui/` 폴더 내 소스.
- **영향 없음**: `src/core/**`, `src/policy/**`, `src/storage/**`.

## 5. 로깅 및 디버그
- **Dev Overlay**: 서버에서 제공하는 응답 메타데이터(latency, latencyMs, stepInfo 등)를 UI 전용 Dev 레이어에서 시각화하되, Runtime 코드 내부에 UI를 위한 조건문 분기를 생성하지 않는다.

## 6. Build-Time Guard Recommendation
- UI 빌드 구성에서 `src/core` 경로 import를 금지하는 lint 또는 alias 차단 규칙을 설정한다.
- (예: tsconfig path restriction 또는 eslint no-restricted-imports)
