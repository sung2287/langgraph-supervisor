# C-011: Secret Injection Intent Map

## 1. 개요 (Overview)
사용자의 시크릿 주입 요청(`intent`)이 런타임 어댑터에서 어떻게 처리되는지 매핑한다. 

## 2. 인텐트 매핑 (Intent Mapping)

### 2.1 Intent: Load Secret Profile
- **발생 지점**: CLI (`--secret-profile`), Web UI (Profile Dropdown).
- **매핑된 동작**: 런타임 어댑터의 `SecretLoader.loadProfile(name)` 호출.
- **결과**: `SecretProfile` 객체 로드 (메모리 상에만 존재).

### 2.2 Intent: Inject to Provider Config
- **발생 지점**: 런타임 실행 준비 단계 (`resolveProviderConfig` 직전).
- **매핑된 동작**: 로드된 `SecretProfile`에서 필요한 `apiKey`를 `ProviderConfig` 객체에 주입.
- **결과**: LLM 요청 시 인증 정보가 포함된 요청 전송 가능.

## 3. 예외 매핑 (Exception Mapping)

| Intent | 에러 조건 | 결과 인텐트 (Fail-Fast) |
|:---|:---|:---|
| Load Profile | 파일 없음 (FileNotFound) | `abort_with_guide(create_secret_guide)` |
| Load Profile | 프로파일 없음 (NameMismatch) | `abort_with_error(profile_not_found)` |
| Inject | 키 누락 (KeyMissing) | `abort_with_error(api_key_required)` |

## 4. 보안 인텐트 (Security Intents)
- **Sanitize Profile**: 어댑터는 주입 전 프로파일 객체에 불필요한 필드가 있는지 검사한다.
- **Prevent Leak**: `GraphState`에 시크릿이 포함된 객체가 전달되지 않도록 필터링한다.

---
**RED FLAG**: `src/core/plan/executor.ts` 내부에서 직접 `secrets.json` 파일을 읽으려는 인텐트 설계는 원칙적으로 금지된다. 시크릿은 반드시 `adapter` 레벨에서 수동 주입(Manual Injection)되어야 한다.
