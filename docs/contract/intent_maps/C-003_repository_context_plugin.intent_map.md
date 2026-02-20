# C-003_repository_context_plugin.intent_map.md

## 1. Why (의도)
- **Efficiency:** 대규모 저장소에서 매번 발생하는 불필요한 스캔 비용을 줄이기 위해 캐싱된 스냅샷 구조를 도입한다.
- **Safety:** AI 런타임이 대상 코드를 오염시키지 않도록 실행 환경과 데이터 저장소를 엄격히 분리한다.
- **Decoupling:** Core 엔진이 파일 시스템 구조에 직접 의존하지 않도록 하여, 클라우드 저장소나 API 기반 소스로 확장 가능한 기반을 마련한다.

## 2. Risk Analysis
- **Core 오염 가능성:** Core가 스캔 결과의 특정 필드(예: `fileIndex`)에 로직을 의존하게 될 경우, 플러그인 제거 시 시스템이 붕괴될 위험이 있다.
- **Storage Bloat:** 잦은 스캔으로 인해 `ops/runtime/` 내 스냅샷 파일이 과도하게 커져 저장 공간을 점유할 위험이 있다.
- **Snapshot Drift:** 실제 저장소 내용과 스냅샷 간의 불일치로 인해 LLM이 잘못된 정보를 생성할 위험이 있다.

## 3. Drift Detection Point
- "The core engine executes an abstract execution plan and has no intrinsic knowledge of repository scanning."
- "The repository snapshot must be stored within runtime-managed state directories and must not modify the target repository."
- "Repository scanning is never mandatory."
- "Core execution must not fail if the plugin is absent."
- Core 소스 코드 내에서 plugin 존재를 가정한 로직이 발견되거나, `fs.readFileSync` 등으로 대상 저장소를 직접 탐색하는 로직이 발견되면 Intent Drift로 간주한다.

## 4. Future Expansion Path
- **Vector Search Integration:** 단순 텍스트 인덱싱에서 RAG 기반 벡터 검색 플러그인으로의 확장.
- **Selective Scanning:** 정책에 따라 특정 디렉토리나 파일 타입만 선별적으로 스냅샷하는 기능.
- **Remote Source:** 로컬 파일 시스템이 아닌 GitHub API 등을 통한 원격 저장소 스캔 지원.
