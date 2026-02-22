# B-011: Secret Injection Contract

## 1. 개요 (Overview)
본 문서는 시크릿 주입 시스템의 데이터 스키마와 어댑터 인터페이스를 정의한다. 시크릿은 런타임 어댑터 단계에서만 취급되며 엔진 내부로 직접 전달되지 않는다.

## 2. 공통 원칙 (Common Principles)
- **Core-Zero-Mod**: `src/core/**` 수정 금지.
- **No-Extensions-Usage**: `ExecutionPlan.extensions`는 항상 `[]`를 유지한다.
- **Secret-Isolation**: 시크릿은 `GraphState`, `Session`, `DB`에 기록하지 않는다.
- **Fail-Fast Consistency**: 에러 발생 시 `runtime/error.ts`의 표준 코드 체계를 사용한다.

## 3. 데이터 스키마 (JSON Schema)
시크릿 저장소(`secrets.json`)는 Profile 기반 계층 구조를 가지며, Provider 명칭은 열린 문자열(Open string)로 허용하되 어댑터의 맵핑 룰을 따른다.

```json
{
  "type": "object",
  "patternProperties": {
    "^[a-zA-Z0-9_-]+$": {
      "type": "object",
      "properties": {
        "providers": {
          "type": "object",
          "patternProperties": {
            "^[a-zA-Z0-9_-]+$": {
              "type": "object",
              "properties": {
                "apiKey": { "type": "string" },
                "baseUrl": { "type": "string" },
                "organization": { "type": "string" }
              },
              "required": ["apiKey"]
            }
          }
        }
      },
      "required": ["providers"]
    }
  }
}
```

## 4. 인터페이스 정의 (Interface)

### 4.1 ISecretManager (Adapter Layer)
```typescript
/** Provider별 주입용 Env 객체 타입 */
export type ProviderResolutionEnv = Record<string, string>;

export interface ISecretManager {
  /** 지정된 프로파일에서 시크릿 로드 */
  loadProfile(profileName: string): Promise<SecretProfile>;
  
  /** 
   * ProviderResolutionEnv 객체를 생성하여 반환.
   * process.env 직접 오염을 방지하기 위해 resolveProviderConfig에 전달할 전용 객체로 사용.
   */
  getInjectionEnv(profile: SecretProfile): ProviderResolutionEnv;

  /** (Discouraged) Fallback 전략으로 process.env에 직접 병합 */
  injectToProcessEnv(profile: SecretProfile): void;
}
```
- **Env Object Scope**: `ProviderResolutionEnv`는 `resolveProviderConfig`에 전달되는 1회성 객체이며, 실행 종료 후 저장되거나 `session_state`에 기록되지 않는다.
- **Hash Isolation**: 시크릿 값(apiKey 등)은 `ExecutionContextMetadata` 및 `Plan Hash` 계산에 포함되지 않는다.

## 5. 실패 정의 (Failure Semantics)
- **CONFIGURATION_ERROR**: 프로파일 미존재, 필수 `apiKey` 누락, JSON 파싱 실패 시 발생.
- **Fail-fast**: 해당 실행(Run)을 즉시 중단(Abort)하되, 시스템 전역 프로세스나 다른 세션 파일을 오염시키지 않는다.
- **Secret Redaction**: 에러 메시지, 로그, 예외 객체, 세션 파일, DTO 등 어떤 출력 경로에도 `apiKey`, `organization`, `baseUrl` 등의 시크릿 값이 평문으로 노출되어서는 안 된다. 로그 출력 시에는 반드시 마스킹 처리(예: `sk-****`)를 적용한다.

## 6. RED FLAG (Design Rejection Required)
- `ExecutionPlan.extensions`에 시크릿 정보를 포함하는 행위 금지.
- `src/core` 내부 타입(GraphState 등)을 시크릿 어댑터에서 직접 임포트하여 수정하는 행위 금지.
- `session_state.json` 구조를 시크릿 저장을 위해 변경하는 행위 금지.
