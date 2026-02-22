# B-012A: Deterministic Hash Contract

## 1. 개요 (Overview)
본 문서는 런타임 오케스트레이터가 사용하는 해시 메타데이터 규격을 정의한다.

## 2. 인터페이스 정의 (Interface)

```typescript
/**
 * 결정론적 해시 생성을 위한 실행 컨텍스트 메타데이터
 */
export interface ExecutionContextMetadata {
  /** LLM 공급자 (예: 'openai', 'gemini') */
  provider: string;
  /** 사용 모델명 (예: 'gpt-4o', 'gemini-1.5-flash') */
  model: string;
  /** 현재 실행 모드 (예: 'research', 'code') */
  mode: string;
  /** 현재 실행 도메인 (기본값: 'global' 또는 '') */
  domain: string;
}

/**
 * 해시 엔진 인터페이스 (Runtime Utility)
 */
export interface IHashEngine {
  /**
   * ExecutionPlan과 Metadata를 결합하여 결정론적 해시 생성
   * @param plan ExecutionPlan (구조적 불변)
   * @param metadata ExecutionContextMetadata (결정론적 필드)
   * @returns sha256 hash string
   */
  computeStableHash(plan: any, metadata: ExecutionContextMetadata): string;
}
```

## 3. 제약 사항 (Constraints)
- **Core-Zero-Mod**: `src/core` 내부 코드를 수정하지 않고 런타임 유틸리티 레이어에서 처리한다.
- **Input Purity**: `metadata` 객체에 가변 필드(`timestamp`, `random` 등)가 포함될 경우 `VALIDATION_ERROR`를 발생시킨다.
- **Strict Key Order**: 직렬화 시 모든 키는 사전순으로 정렬되어야 한다.

## 4. 실패 정의 (Failure Semantics)
- `CONFIGURATION_ERROR`: `metadata`의 필수 필드가 누락되었을 때.
- `VALIDATION_ERROR`: `metadata`에 금지된 필드가 포함되었을 때.
- `SESSION_STATE_HASH_MISMATCH`: 기존 해시와 신규 해시가 불일치할 때(Fail-Fast).

---
**RED FLAG**: `ExecutionPlan.extensions` 필드에 해시 계산을 위한 메타데이터를 포함하려는 모든 설계는 원칙 위반으로 간주됨.
