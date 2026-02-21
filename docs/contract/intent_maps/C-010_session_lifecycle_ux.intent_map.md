# C-010: Session Lifecycle UX Intent Map

## 1. Primary Intent: UX Conflict Resolution
- 세션 해시 불일치로 인한 중단 상황을 사용자가 "수동 파일 삭제"라는 원시적인 방법이 아닌, "명시적 플래그"라는 표준화된 도구로 해결하게 함으로써 사용성을 개선함. 안전 장치(Protection logic)는 그대로 유지함.

## 2. Secondary Intent: Development Productivity
- Smoke Test와 실제 로컬 실행(run:local)의 세션 파일을 분리하여, 테스트 실행이 개발 중인 세션 상태를 오염시키지 않도록 격리된 환경을 제공함.

## 3. Philosophical Alignment
- 본 PRD는 정책의 완화(Relaxation)가 아니라, **명시적 리셋(Reset)** 기능의 추가이다. 자동화된 판단을 배제하고 사용자의 명시적 의도에만 반응한다는 아키텍처 원칙을 준수함.

---
*Last Updated: 2026-02-21 (Reinforced)*
