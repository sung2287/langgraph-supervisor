# D-012A: Deterministic Implementation

## 1. 개요 (Overview)
본 문서는 결정론적 해시 계산을 위한 구체적인 구현 전략을 정의한다.

## 2. 결정론적 직렬화 전략 (Stable Serialization)
1. **Key Sorting**: 입력 객체를 재귀적으로 순회하며 모든 Key를 사전순으로 정렬한 새로운 객체를 생성한다.
2. **Standard Stringify**: 정렬된 객체를 `JSON.stringify` 처리한다.
3. **Hashing**: 정렬된 문자열을 `SHA-256` 알고리즘으로 해싱한다.

### 2.1 예시 알고리즘 (Conceptual)
```typescript
function deepSortKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(deepSortKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = deepSortKeys(obj[key]);
    });
    return sorted;
  }
  return obj;
}

function computeStableHash(plan: any, metadata: ExecutionContextMetadata): string {
  const payload = {
    plan: deepSortKeys(plan),
    metadata: deepSortKeys(metadata)
  };
  return sha256(JSON.stringify(payload));
}
```

## 3. 런타임 통합 (Runtime Integration)
- **Location**: `runtime/utils/hash.ts` (신규 유틸리티)
- **Integration Point**: `RuntimeOrchestrator.initialize` 또는 세션 로드 직전 단계.
- **Canonicalization Responsibility**: provider/model 값의 정규화(trim, lowercase, alias mapping 등)는 `provider.router.ts`에서 단일 책임(SSOT)으로 수행된다. Hash 계산 로직은 이미 canonicalize된 최종 값만을 입력으로 사용한다. 해시 유틸리티 또는 오케스트레이터 레벨에서 별도의 정규화를 수행하지 않는다.

**Breaking Change Notice**:
본 PRD 적용 이후 기존 `session_state.json` 파일은 해시 계산 구조 변경으로 인해 모두 mismatch가 발생한다. 이는 의도된 구조적 강화이며, 기존 세션은 `--fresh-session`을 통해 명시적으로 분리해야 한다. 자동 마이그레이션은 지원하지 않는다.

## 4. 변경 대상 파일 및 리팩토링 범위
- **`runtime/utils/hash.ts`**: (신규) 결정론적 해싱 로직 구현.
- **`runtime/orchestrator.ts`**: (수정) 신규 해싱 유틸리티 호출 및 메타데이터 구성.
- **`runtime/session/store.ts`**: (수정) 해시 검증 시 `ExecutionContextMetadata` 주입 지원.

## 5. 위험 요소 및 롤백 전략 (Risks & Rollback)
- **Risks**: 기존에 생성된 모든 `session_state.json` 파일의 해시가 일치하지 않게 됨. (Breaking Change)
- **Compatibility Mode**: 필요 시 기존 해시 계산 방식을 `legacyHash`로 유지하고, 새로운 방식을 `v2Hash`로 도입하여 점진적 전환 가능.
- **Emergency Revert**: 오케스트레이터의 해시 호출부를 이전 코드로 복구하여 즉시 롤백 수행.

---
**RED FLAG**: `src/core` 내의 `verify` 함수 내부 로직을 수정하여 도메인 유효성을 검증하려는 설계는 계층 위반으로 간주됨.
