# D-012: Override UX Platform

## 1. 개요 (Overview)
본 문서는 오버라이드 옵션을 실제 실행 환경(CLI 및 UI)에서 어떻게 처리하는지 정의한다. 

## 2. CLI 플래그 처리 (Flag Processing)

| Flag | 설명 (Description) | 예시 (Example) |
|:---|:---|:---|
| `--provider` | 사용할 프로바이더 수동 지정 | `--provider anthropic` |
| `--model` | 구체적인 모델명 수동 지정 | `--model claude-3-5-sonnet` |
| `--secret-profile` | 사용할 시크릿 프로파일 지정 | `--secret-profile work` |

- **Detection Strategy**: `RuntimeAdapter`는 실행 시점에 인자로 전달된 플래그를 파싱하여 `RuntimeOverrideOptions`를 생성한다. 

## 3. UI 연동 및 세션 관리 (UI & Session Management)
- **Dropdown State**: Web UI 상의 선택된 값은 어댑터에 실시간 반영되며, "Run" 버튼 클릭 시 오버라이드 옵션으로 사용된다. 
- **Auto-Fresh Session Logic**: 
  - HashMismatch 감지 시 런타임은 즉시 Fail-Fast 종료하며 사용자에게 재실행 가이드를 제공한다.
  - 사용자가 `--fresh-session`을 선택할 경우, `FileSessionStore`는 기존 파일을 `_bak` 폴더로 `rename` 백업한 후 새 세션을 생성한다. (데이터 파괴 없음)

## 4. 환경 변수 우선순위 (Env Variable Priority)
- 환경 변수 명칭은 `LLM_PROVIDER`, `LLM_MODEL`을 사용한다.
- Adapter 레벨의 별도 별칭(Alias) 매핑은 금지된다.
- 환경 변수 `LLM_PROVIDER` 또는 `LLM_MODEL`이 설정되어 있어도, CLI 플래그나 UI 선택이 있다면 이를 무시하고 오버라이드 옵션을 우선적으로 적용한다. 
 

## 5. 실행 결과 노출 (Visibility)
- 실행 시점에 "Active Provider: [openai], Active Model: [gpt-4o]" 정보를 화면 상단에 명시하여 사용자가 현재 어떤 설정으로 실행 중인지 명확히 인지하게 한다. 

## 6. 제약 사항 (Constraints)
- **No-Mutation of Policy**: 오버라이드 시에도 `policy/*.yaml` 파일은 절대 수정하지 않는다. 
- **Fail-Fast for Invalid Inputs**: 지원하지 않는 프로바이더나 모델이 입력될 경우, 엔진 호출 전 즉시 프로세스를 종료한다. 

---
**RED FLAG**: 오버라이드 정보를 `session_state.json`의 `config` 섹션에 무분별하게 저장하여 영구 설정을 변경하려는 설계는 지양한다. 오버라이드는 실행 단위의 휘발성 설정으로 취급한다.
