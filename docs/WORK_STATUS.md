# 작업 상태 — 2026-07-13

## 이번 반영으로 완료

- 마일스톤 H-1~H-5: 터치 스타필드 비용 절감, 320px·가로모드 회귀망, 정적 콘텐츠 모듈화,
  미사용 PNG 제거, 폰트 스택 정리.
- 마일스톤 G-1~G-5: 섹션별 제목, SearchAction 실제 동작, FAQ JSON-LD 검증, 공유 메타,
  `/guide/` 정적 가이드와 sitemap.
- 백로그 재검증: 함선 EN 데이터와 RSVP 표시 i18n은 이미 구현되어 있었고, ShipDB 후보 분류는 완료 상태로 정정.

## 운영자 또는 외부 원본 대기

| 항목 | 필요한 권한 또는 입력 | 실행 방법 |
|---|---|---|
| D1 migration 0008~0011 적용 확인 | 운영 D1 접근 권한 | `SELECT id, applied_at FROM schema_migrations ORDER BY id;` |
| Admin Erkul preview 리허설 | 관리자 로그인 | CMS에서 preview 실행 → hash 확인 → 로컬 apply |
| Hammerhead 가격 anomaly | 인게임/Erkul 원본 확인 | 구·신 엔티티 중 실제 판매가 확인 후 `ship-market.js` 정리 |
| 배포 Lighthouse/RUM | 배포 환경 접근 | 운영 URL에서 성능·SEO 실측 |
| Search Console·네이버 제출 | 검색 도구 소유자 권한 | sitemap 제출 및 색인 상태 확인 |

## 의도적으로 보류

- Stage B setup 지연: 이벤트 바인딩 순서 회귀 위험이 커서, 실제 성능 계측에서 필요성이 확인될 때만 진행한다.
- CSS 콤마 그룹 중복 100건: 공용 베이스+오버라이드 구조이므로 자동 병합하지 않는다.
