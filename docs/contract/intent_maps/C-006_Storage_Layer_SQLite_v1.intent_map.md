# C-006: Storage Layer (SQLite v1) Intent Map

## 1. Problem Recognition (The Why)

- **Scalability Limits of JSON**: 텍스트 기반 JSON 저장 방식은 데이터 양이 증가함에 따라 입출력 오버헤드와 관리 복잡성이 기하급수적으로 증가함.
- **Search Performance**: 단순 키워드 매칭 및 필터링을 파일 기반으로 수행할 경우 성능 병목이 발생하며, 관계형 쿼리의 이점을 활용할 수 없음.
- **Persistent Memory Requirement**: 세션 간 정보를 공유하고 런타임 상태를 안정적으로 유지하기 위해 정형화된 영속 저장 계층이 필수적임.

## 2. Intent Summary (The Core Philosophy)

- **"Storage는 판단하지 않는다."**: Domain 결정 금지 및 Anchor 무결성 검증 책임  분리를 통해 이 원칙을 고수한다.
- **"데이터 무결성은 Fail-Fast로 보호한다."**

## 3. Protection Targets (The What to Protect)

- **Data Integrity**: 저장된 데이터의 물리적, 논리적 정합성을 보장함.
- **Session Continuity**: 세션 재시작 시에도 메모리 및 리포지토리 메타데이터를 일관되게 제공함.
- **Core Neutrality**: 저장소 구현 세부 사항이 Core Engine의 비즈니스 로직에 영향을 주지 않도록 격리함.
- **Domain Ownership은 Runtime의 책임이며, Storage는 Domain을 판단하지 않는다. Phase는 Domain을 유도하지 않는다.**

## 4. Risks & Guards (The How to Prevent)

- **Business Logic Intrusion**: Storage Layer가 재스캔 여부를 결정하거나 데이터  가공 로직을 포함하는 것을 '역할 전도'로 정의하고, 이를 **Passive Storage** 원칙으로 방지함.
- **Silent Data Deformation**: 자동 마이그레이션 중 발생하는 예측 불가능한 데이터 변형을 방지하기 위해, 버전 불일치 시 수정을 시도하지 않고 즉시 **Fail-Fast**함.
- **Silent Write Failure**: 쓰기 실패를 무시하고 진행할 경우 발생하는 세션 오염을 방지하기 위해, 모든 쓰기 오류는 즉시 시스템 종료로 처리함.
