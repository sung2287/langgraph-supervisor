# B-008: PolicyInterpreter Contract (Revised v2)

## 1. NormalizedExecutionPlan 인터페이스 (LOCK)
Interpreter의 결과물은 아래의 최소 구조로 제한된다.

```ts
interface NormalizedExecutionPlan {
  step_contract_version: "1" | "1.1";
  metadata: {
    policyProfile: string;  // 로드된 정책 식별자
    mode: string;           // 실행 단계 (Phase)
    topK?: number;          // Legacy RetrieveMemory용
  };
  steps: NormalizedStep[];
}
```

## 2. 정규화 변환 규격
- **StepType Mapping**: 정책의 `recall` → `RetrieveMemory`, `memory_write` → `PersistMemory` 등 canonical 명칭으로 변환.
- **Payload Alignment**: B-007 규격에 맞게 입출력 필드 구조 정제.
- **Value Normalization**: 누락된 필수 필드에 대해 정책 정의에 기반한 기본값(Default) 주입.

---
*Last Updated: 2026-02-21 (Revised v2)*
