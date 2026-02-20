# C-001_core_runtime_skeleton.intent_map.md

## 1. Why
- **도메인 오염 방지**: Core 엔진이 특정 산업이나 기술 스택에 종속되는 것을 방지하여 범용성을 극대화한다.
- **워크플로우 교체 가능성 확보**: 코드 수정 없이 정책 파일(YAML/MD) 교체만으로 시스템의 전체 동작 방식을 변경할 수 있는 유연성을 제공한다.
- **장기 확장성 확보**: 새로운 기능이나 도구가 추가될 때 Core 엔진의 안정성을 해치지 않고 플러그인 형태로 결합할 수 있는 구조를 지향한다.

## 2. Core Risk
- **실행 계획 외 로직 침투**: `executionPlan`을 통하지 않고 Core 내부에 직접적인 워크플로우 제어 로직이 추가될 경우 아키텍처가 붕괴된다.
- **Mode 기반 하드코딩**: `currentMode` 문자열을 비교하여 특화 로직을 수행하는 코드가 추가될 경우 정책과 엔진 간의 결합도가 상승하여 재사용성이 저하된다.
- **강결합 플러그인**: 특정 플러그인(예: repo_scan)을 Core의 필수 라이브러리로 포함할 경우, 해당 기능이 불필요한 환경에서도 무거운 엔진을 유지해야 하는 비효율이 발생한다.

## 3. Drift Detection Sentence (Intent Drift Check용 핵심 문장)
- "Core Engine은 executionPlan 외 어떠한 워크플로우 의미도 해석하지 않는다."
- "Mode 값은 실행 의미를 가지지 않는다."
- "Policy Profile 선택은 Core의 실행 의미를 변경하지 않는다."
- "Profile 변경은 executionPlan 생성에만 영향을 주며 Core 구조에는 영향을 주지 않는다."
- "Core Engine never reads policy/profiles directories."
- "Profile selection logic is outside Core."
- "Core behavior must not change if profile directory structure changes."
- "Core never performs file I/O related to policy resolution."
- 위 문장이 깨지거나, Core 코드 내에서 특정 모드 또는 프로필 이름을 검색하여 로직을 수행하는 패턴이 발견되거나, Core 파일이 policy YAML 파싱 유틸리티를 임포트할 경우 Intent Drift로 간주한다.

## 4. Future Extension Boundary
- **Bundle-first 구조 유지**: 문서 번들을 컨텍스트로 주입하는 방식과 Core의 실행 루프가 상호 간섭 없이 공존해야 한다.
- **Memory/RAG 통합**: 향후 RAG나 장기 메모리가 도입되어도 Core는 이를 단순한 컨텍스트 공급 단계로 취급하며, 실행기 본연의 역할에 집중한다.
- **인터페이스 확장성**: 멀티모달이나 새로운 LLM API 대응 시 ModelCall 어댑터 레이어만 확장하고 Core의 실행 파이프라인은 유지한다.
