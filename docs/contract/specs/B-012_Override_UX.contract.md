# B-012: Override UX Contract

## 1. 개요 (Overview)
본 문서는 실행 시점의 프로바이더와 모델 오버라이드를 위한 데이터 구조 및 런타임 옵션 인터페이스를 정의한다. 

## 2. 공통 원칙 (Common Principles)
- **Core-Zero-Mod**: `src/core/**` 수정 금지.
- **No-Extensions-Usage**: `ExecutionPlan.extensions`는 항상 `[]`를 유지한다.
- **Session-Hash-Strict**: mismatch 시 강제 재사용을 금지하며 `fresh-session`으로 분리한다.
- **Fail-Fast Consistency**: 에러는 `runtime/error.ts`의 표준 코드 체계를 사용한다.

## 3. 데이터 구조 (Data Structure)
오버라이드에 사용될 옵션 객체와 실행 컨텍스트에 포함될 메타데이터를 정의한다.

```typescript
/** 런타임 실행 옵션 정의 */
export interface RuntimeOverrideOptions {
  provider?: string;
  model?: string;
  secretProfile?: string;
}

/** 
 * Plan Hash 계산의 원천 데이터가 되는 메타데이터 구성 요소 
 * hash(ExecutionPlan structure + Metadata)
 */
export interface ExecutionContextMetadata {
  provider: string;
  model: string;
  mode: string;
  domain: string;
  // Secret 값(apiKey, profile 등)은 해시에 포함 금지
}
```

## 4. 인터페이스 요구사항 (Interface Requirements)
- **Calculation Delegation**: `ExecutionContext` 및 `Plan Hash` 계산 방식은 `runtime orchestrator`가 제공하는 유틸리티 함수에 위임한다. 계약(Contract)은 입력과 출력 인터페이스만 정의하며 내부 계산 세부는 고정하지 않는다.
- **Hash Sensitivity**: 오버라이드된 `provider`와 `model`은 `ExecutionContextMetadata`에 포함되어야 하며, 이는 세션 로드 시 `Plan Hash` 계산의 원천 데이터가 된다.
- **Single Source of Truth**: `Plan Hash` 계산은 `Runtime Orchestrator`가 단일 책임(SSOT)을 가진다. Web/CLI 어댑터는 해시를 직접 계산하지 않으며, 오직 `metadata`만 전달한다.
- **Canonicalization**: `ExecutionContextMetadata`의 provider/model/mode/domain 값은 Runtime Orchestrator가 canonicalize(정규화)한 최종 값만 사용한다. 어댑터는 대소문자 변경, trim, alias 적용 등 임의 변환을 수행하지 않는다. 해시 입력값의 정규화 책임은 Orchestrator에 단일 귀속된다.

## 5. 실패 정의 (Failure Semantics)
에러 코드 체계는 `runtime/error.ts`를 따르며, 임의의 예외 명칭은 사용하지 않는다.
- **PLAN_HASH_MISMATCH**: 기존 세션의 해시와 오버라이드 결과 해시가 불일치할 경우.
- **CONFIGURATION_ERROR**: Provider 또는 Model 파싱 중 설정이 누락된 경우.
- **VALIDATION_ERROR**: 지원하지 않는 Provider/Model 조합일 경우.

## 6. RED FLAG (Design Rejection Required)
- `ExecutionPlan.extensions`에 오버라이드 정보를 기록하여 해시 변화를 유도하는 행위 금지.
- `src/core` 내부 타입(ExecutionPlan 등)을 어댑터에서 직접 임포트하여 수정하는 행위 금지.
- `session_state.json` 구조를 오버라이드 정보 저장을 위해 변경하는 행위 금지.
- Secret 값(apiKey, secretProfile 등)을 해시 계산 식에 포함하는 행위 금지.
