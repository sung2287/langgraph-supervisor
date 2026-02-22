# B-016: Session Management Contract

## 1. Overview
Web UI와 Runtime Adapter 간의 세션 관리 API 규격을 정의합니다.

## 2. API Endpoint Definitions

### 2.1 GET /api/sessions
웹 전용 세션 목록을 조회합니다.
- **Source-of-Truth**: 세션 목록의 정본은 실제 세션 파일(`.json`)의 존재 여부임.
- **Metadata Overlay**: `web_session_meta.json`은 UI 전용 오버레이 데이터임.
    - 세션 파일이 존재하나 메타데이터가 없는 경우: 파일의 `mtime`을 `lastUpdatedAt`으로 사용하고 프리뷰는 비워서 반환함.
    - 메타데이터는 존재하나 실제 세션 파일이 없는 경우: 해당 항목을 목록에서 즉시 제외함.
- **Namespace Lock**: `session_namespace.ts`에서 허용하는 세션만 포함.
- **Hash Guard**: `executionPlanHash` 등 해시 필드 노출 엄격 금지.

### 2.2 DELETE /api/session/:id
세션을 백업 로테이션 처리합니다. (기존 로직 유지)

### 2.3 POST /api/session/switch
활성 세션을 변경합니다.
- **Strict Validation Order**:
    1. **Namespace Authorization**: `runtime/orchestrator/session_namespace.ts`를 통한 권한 검증. 실패 시 **403 Forbidden**.
    2. **File Existence Check**: 실제 세션 파일 존재 여부 확인. 실패 시 **404 Not Found**.
    3. **Perform Switch**: 위 검증 통과 시에만 전환 수행.

## 3. DTO Definitions
### `WebSessionListItemDTO`
```typescript
interface WebSessionListItemDTO {
  sessionId: string;
  lastUserMessagePreview?: string;
  lastUpdatedAt: number;
  isActive: boolean;
}
```

## 4. Error Code Specification
- **409 Conflict**: 엔진 가동 중 삭제 시도.
- **403 Forbidden**: 네임스페이스 권한이 없는 세션 조작 시도 (검증 1순위).
- **404 Not Found**: 존재하지 않는 세션 ID 요청 (검증 2순위).
