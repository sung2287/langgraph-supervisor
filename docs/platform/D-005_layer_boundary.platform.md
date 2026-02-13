# D-005 : Platform / Implementation Plan
(Layer Boundary Enforcement)

---

## 1. 목적

본 문서는 B-005 및 C-005에서 정의한 아키텍처 경계와 의존성 규칙을 실제 개발 및 운영 환경에서 **자동으로 감지하고 강제(Enforcement)**하기 위한 플랫폼 레벨의 계획을 기술한다.
규칙은 문서에만 존재해서는 안 되며, 파이프라인(Pipeline)에 의해 물리적으로 집행되어야 한다.

---

## 2. 디렉토리 기준 Enforcement 규칙

시스템은 파일 경로(File Path)를 기준으로 해당 코드의 역할을 식별하고 규칙을 적용한다.

### 2.1 경로별 적용 규칙

| 경로 패턴 | 허용 Import 패턴 | 금지 Import 패턴 | 비고 |
| :--- | :--- | :--- | :--- |
| `src/core/**/*.ts` | `src/core/**` | `src/adapter/**`, `src/sandbox/**`, `node_modules/**` | 엄격한 순수성 강제 |
| `src/adapter/**/*.ts` | `src/core/**`, `node_modules/**` | `src/sandbox/**` | Core 의존 필수, Sandbox 참조 불가 |
| `src/sandbox/**/*.ts` | `*` (All allowed) | - | 자유 구역 (단, 배포 제외) |

---

## 3. 구조/정책 테스트 집행 범위

아키텍처 검증은 단위 테스트(Unit Test)가 아닌 **구조 테스트(Structural Test)** 단계에서 수행된다.

### 3.1 정적 분석 (Static Analysis)
- **실행 시점**: 로컬 Pre-commit Hook 및 CI 파이프라인 초기 단계.
- **검사 대상**: `src` 디렉토리 내의 모든 TypeScript 파일.
- **검사 내용**:
  - `import` 구문 파싱을 통한 의존성 그래프 생성.
  - 정의된 허용/금지 규칙과 그래프 대조.
  - 순환 참조(Circular Dependency) 탐지.

### 3.2 린트 규칙 (Linting Rules)
- **실행 시점**: 에디터 실시간 검사 및 CI 린트 단계.
- **검사 내용**:
  - 레이어별 파일 명명 규칙 준수 여부.
  - Core 내부에서의 `try-catch` 사용 제한 (B-004 연계).
  - 금지된 모듈 사용 (예: Core에서 `fs`, `http` 모듈 사용).

---

## 4. CI 파이프라인 내 위치 및 운영

구조 위반은 기능 오류만큼이나 심각한 결함으로 간주한다.

### 4.1 Gatekeeper 정책
- **CI Status**: 구조 테스트 실패 시 빌드는 즉시 **실패(Failure)** 처리된다.
- **Merge Block**: 구조 위반 사항이 포함된 PR은 메인 브랜치로 병합될 수 없다. (Force Merge 금지)
- **신호(Signal)**: 위반 발생 시 "Architecture Violation"이라는 명확한 에러 메시지와 함께 **HOLD** 신호를 출력한다.

### 4.2 감지 및 리포팅
- 위반이 감지되면 다음 정보를 리포트에 포함해야 한다.
  - 위반 파일 경로 (Source)
  - 금지된 의존성 경로 (Target)
  - 위반된 규칙 (Rule ID)
- 이는 개발자가 "왜 빌드가 실패했는지"를 아키텍처 관점에서 즉시 이해할 수 있도록 돕는다.

---

## 5. 예외 처리 절차

아키텍처 규칙의 예외는 원칙적으로 허용되지 않는다. 단, 프레임워크의 불가피한 제약 등으로 인해 예외가 필요한 경우 다음 절차를 따른다.

1.  **Issue 등록**: 위반이 필요한 사유를 명확히 기술한 이슈 생성.
2.  **Architect 승인**: 아키텍처 담당자의 검토 및 승인.
3.  **Allowlist 등록**: 정적 분석 도구의 설정 파일(Configuration) 내 '무시 목록(Ignore Path)'에 해당 파일만 명시적으로 등록.
4.  **주석 표기**: 코드 내에 `// eslint-disable-line` 등과 같이 예외 사유를 주석으로 남김.
