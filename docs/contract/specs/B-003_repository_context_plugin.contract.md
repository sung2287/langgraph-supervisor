# B-003: Repository Context Plugin Contract

## 1. Purpose
- 이 계약은 Repository Context Plugin과 Core Engine 간의 물리적/논리적 분리를 보장한다.
- Repository Scanning 동작이 Core의 필수 요소가 아닌 "선택적 도구"임을 정의하며, 외부 저장소에 대한 **READ-ONLY** 원칙을 고정한다.

## 2. Scope
- **Core Influence:** Core Engine은 플러그인의 존재 유무와 상관없이 동작해야 하며, `executionPlan`에 포함된 경우에만 플러그인을 호출한다.
- **Domain Pack:** 특정 언어나 프레임워크에 종속되지 않는 범용 파일 인덱싱 및 스냅샷 구조를 가진다.

## 3. Invariants (불변 규칙)
- **Read-Only Target:** 대상 저장소(Target Repository)에 어떠한 파일도 생성하거나 수정할 수 없다.
- **Runtime-Managed State:** 생성된 모든 스냅샷 및 결과물은 오직 `ops/runtime/` 이하 디렉토리에만 저장되어야 한다.
- **Policy-Driven Trigger:** 플러그인은 Core에 의해 자동 실행되지 않으며, 오직 `executionPlan` 내의 명시적 단계 또는 사용자 정의 트리거(예: `#rescan`)에 의해서만 호출된다.
- **Snapshot Reuse:** 유효한 스냅샷이 존재하고 정책상 갱신 조건이 충족되지 않은 경우, 물리적 재스캔 없이 기존 데이터를 재사용해야 한다.
- **Opaque Results:** 플러그인이 반환하는 데이터는 Core가 해석하지 않고, `ContextSelect` 단계에서 LLM 프롬프트 조립을 위한 소스로만 활용된다.
- **Core Independence:** The core engine must not detect or depend on the physical existence of the repository plugin.
- **Zero Modification:** Disabling or removing the plugin must require zero modifications to the core execution loop.
- **Optionality:** Repository scanning is optional and must never be implicitly mandatory.

## 4. Non-Goals
- 실시간 파일 감시(File Watching) 및 동기화.
- 대상 저장소의 코드 수정(Write-back) 기능.
- 특정 프로그래밍 언어의 구문 분석(AST Analysis) 수준의 깊은 인덱싱 (범용 인덱싱만 수행).
