# D-011: Secret Injection Platform

## 1. 개요 (Overview)
본 문서는 시크릿 저장소의 물리적 위치와 보안 정책을 정의한다.

## 2. 저장 위치 정의 (OS Specific Paths)

| OS | 경로 전략 (Path Strategy) | 구체적 경로 (Example Path) |
|:---|:---|:---|
| Linux | `$HOME/.langgraph-orchestration/secrets.json` | `/home/user/.langgraph-orchestration/secrets.json` |
| macOS | `$HOME/.langgraph-orchestration/secrets.json` | `/Users/user/.langgraph-orchestration/secrets.json` |
| Windows | `%USERPROFILE%\.langgraph-orchestration\secrets.json` | `C:\Users\user\.langgraph-orchestration\secrets.json` |

- **폴더 자동 생성**: 런타임 어댑터가 최초 실행 시 해당 경로가 없으면 빈 폴더 및 `secrets.json` 파일을 생성한다.

## 3. 권한 정책 (Permission Policies)
- **추천 권한 (Linux/macOS)**: `600` (소유자만 읽기/쓰기 가능).
- **Windows**: 현재 사용자 계정에만 `Full Control` 권한 부여.
- **공유 파일 시스템 주의**: NFS나 공용 폴더에 시크릿 파일을 두지 않도록 사용자 가이드 문구를 출력한다.

## 4. 로드 프로세스 (Load Process)
1. **CLI Flag Detection**: `--secret-profile` 또는 기본값(`default`) 감지.
2. **File Read**: OS별 경로에서 `secrets.json` 로드.
3. **Validation**: JSON 스키마(B-011)에 따른 형식 검증.
4. **Environment Merging**: 로드된 프로파일의 apiKey는 Runtime Adapter가 생성한 1회성 ProviderResolutionEnv 객체에만 주입한다. process.env 직접 병합은 fallback 전략으로만 허용된다.
5. **Clean-up**: 로드 완료 후 런타임 종료 시까지 메모리에만 유지.

## 5. 보안 가이드라인 (Security Guidelines)
- **No Git Check-in**: `.gitignore`에 상관없이 시크릿 파일은 프로젝트 외부에 위치해야 함.
- **No Console Logging**: 시크릿 값은 로깅 및 에러 메시지에 절대 포함되지 않음.
- **Fail-Fast Policy**: 파일 권한이 너무 개방적일 경우 경고 메시지 출력.

---
**RED FLAG**: 시크릿 파일의 경로를 환경 변수 이외의 `GraphState`나 `Policy` 설정 파일에 직접 기입하는 행위는 보안상 금지된다.
