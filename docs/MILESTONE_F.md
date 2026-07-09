# 마일스톤 F — SEO·공유 품질 (초안, PM 승인 대기)

기준선: `v1.0-quality` (`35d582a`, 2026-07-09). 목표: 기능이 아니라 **검색 유입·공유 첫인상·외부 노출력**.

## 실사 결과 (2026-07-09, 코드 기준)

**이미 완료된 기본기 — 재작업 금지:**
- OG/Twitter 카드 전체 세트 + `og:image` 1200×630 실파일 존재
- `canonical` + `hreflang`(ko/en/x-default)
- JSON-LD: Organization + WebSite(SearchAction)
- robots.txt(admin/api 차단) + sitemap.xml(root, lastmod 자동 갱신)
- noscript 폴백, sr-only 사이트 h1, 스타일된 404 페이지

**확인된 빈틈 (이번 범위):**

| # | 항목 | 현황 | 개선 |
|---|---|---|---|
| F-1 | 섹션별 document.title | 해시 전환 시 타이틀 불변 (i18n 전역 1개만) | `함선DB — VOLT` 식 섹션 타이틀 + i18n. 공유/북마크/분석 가독성 |
| F-2 | FAQPage 구조화 데이터 | 없음 (FAQ 콘텐츠는 volt-data에 존재) | FAQ 렌더 시 `application/ld+json` 동적 삽입 (Googlebot은 JS 렌더 후 수집) |
| F-3 | SearchAction 실효성 | `?search={term}` 템플릿 선언만 — 쿼리 파라미터 처리 코드 확인 필요 | `?search=` 진입 시 검색 오버레이 자동 실행 연결 (미동작 시) |
| F-4 | 메타 마감 | `og:site_name` 없음, EN 공유 메타 없음 | `og:site_name`, `og:locale:alternate`(en_US) 추가 |
| F-5 | 문서형 콘텐츠 노출 | 무역가이드/FAQ가 해시 뒤 → 검색엔진에 개별 노출 불가 | **옵션(PM 결정)**: 핵심 가이드 1~2편을 실경로 정적 페이지(`/guide/…`)로 발행 + sitemap 등재. 이 스택(정적 HTML)에서 저비용·고효율 |

## 범위 제외 (사유 명시)

- **해시 → 실경로 전면 전환**: SPA 구조 전면 개편 — 회귀 위험 대비 가치 낮음.
- **prerender/SSR**: 빌드 없는 정적 스택 원칙 위배.
- **og-image 리디자인**: 코드가 아니라 디자인 자산 — 원하면 운영자가 이미지만 교체 (1200×630 유지).
- **keywords meta 정리**: 검색엔진 무시 대상이지만 무해 — 건드리지 않음.

## 게이트·제약

- 기존 전 게이트 유지 (check / Functions / Playwright / 스크린샷 회귀).
- JSON-LD 동적 삽입은 실행 스크립트가 아니므로 CSP(script-src 'self') 무영향 — 단 삽입 방식은 `document.createElement('script')` + `textContent`로 innerHTML 래칫 준수.
- F-5 진행 시 신규 정적 페이지도 a11y 스모크에 포함.

## 운영자 항목 (코드 외)

- Google Search Console / 네이버 서치어드바이저 등록 + sitemap 제출 (1회).
- 공유 캐시 갱신 확인: Discord·카카오톡은 OG 캐시가 길다 — 배포 후 각 플랫폼 디버거로 1회 리프레시.
- Lighthouse SEO 점수 배포 후 실측 (현재 로컬 기준 미측정).

## 완료 기준

- F-1~F-4: 각 항목 스모크 테스트 동반, 게이트 그린.
- F-5(승인 시): 신규 페이지가 sitemap에 등재되고 Lighthouse SEO 95+ 유지.
