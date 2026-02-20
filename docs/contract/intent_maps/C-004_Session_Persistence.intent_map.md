# C-004: Session Persistence Intent Map

## 1. Problem Recognition (The Why)

- **State Loss**: 런타임의 재실행 시 세션의 연속성이 사라져, 이미 수행된 고비용의 분석(Repo Scan 등)이나 대화 요약 참조가 유실됨.
- **Session Contamination**: 정책(Policy)이 변경된 상태에서 이전 정책 기반의 세션 정보를 그대로 활용할 경우, 생성된 대화나 동작의 정합성이 훼손될 위험이 있음.

## 2. Intent Summary (The Core Philosophy)

- **"Session은 참조(Ref) 정보만 저장한다."**
- **"정책 변경 시 세션은 결코 재사용되지 않는다."**
- **"Store는 수동적인 저장소이며, 해시 계산 및 정책 판단은 런타임의 몫이다."**

## 3. Protection Targets (The What to Protect)

- **Policy Consistency**: 생성된 모든 데이터는 특정 정책 버전 하에서 일관성을 유지해야 함.
- **Session Continuity**: 단일 세션 범위 내에서의 작업 흐름 유지를 보장함.
- **Core Neutrality**: 저장을 위해 Core의 내부 데이터 구조를 희생하거나 노출하지 않음.

## 4. Risks & Guards (The How to Prevent)

- **Dangerous Auto-Initialization**: 정책 불일치 시 시스템이 멋대로 데이터를 초기화하고 시작하는 행위를 '데이터 유실 및 정책 위반 위험'으로 정의하고, 이를 **Fail-Fast**로 방지함.
- **Core Structural Leak**: 세션 저장소(Persistence Layer)가 Core Engine의 노드 구조나 실행 계획을 직접 아는 것을 '구조적 침범'으로 간주하여 필드를 엄격히 제한함.
- **Non-deterministic Hashing**: 해시 계산의 비결정성은 불필요한 실행 중단을 유발할 수 있으므로, **Stable Canonical Stringify**를 통해 계산의 일관성을 확보함.
