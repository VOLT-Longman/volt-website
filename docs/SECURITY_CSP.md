# CSP 최종 태세 (Content Security Policy Posture)

2026-07-06 Final Sweep 시점의 CSP 상태·전수 검색 결과·예외·검증 방법을 기록한다.
소스 오브 트루스는 [`_headers`](../_headers)이며, 이 문서는 그 근거와 운영 지침이다.

## 결론

- **production CSP는 enforce 상태이며 `unsafe-inline`/`unsafe-eval`이 없다** (script-src·style-src 모두).
- 코드베이스에 실행형 인라인 패턴이 **0건**임을 전수 검색으로 확인했다 (아래 표).
- 유일한 외부 스크립트 예외는 **Cloudflare Web Analytics(Insights)** 이며 의도된 것이다.

## 현재 정책 (`_headers`)

```
default-src 'self'; base-uri 'self'; frame-ancestors 'none';
form-action 'self' https://forms.gle;
img-src 'self' data: https:;
script-src 'self' https://static.cloudflareinsights.com;
style-src 'self';
connect-src 'self' https://cloudflareinsights.com;
font-src 'self' data:; object-src 'none'; upgrade-insecure-requests
```

| 지시어 | 근거 |
|---|---|
| `script-src 'self' + cloudflareinsights` | 인라인 스크립트 0. 예외는 CF Web Analytics 로더뿐 — **임의 제거 금지** (트래픽 관측 상실). 제거하려면 CF 대시보드에서 Analytics를 먼저 끄고 함께 제거한다 |
| `style-src 'self'` | 인라인 style 속성 0. 동적 스타일은 JS 프로퍼티(`el.style.*`)로만 적용하며 이는 CSP 차단 대상이 아니다 |
| `img-src https:` | 갤러리(R2 공개 URL)·Discord 아바타 등 외부 이미지 허용. 도메인 고정은 R2 커스텀 도메인 확정 후 후속 강화 후보 |
| `form-action forms.gle` | 가입 신청 Google Forms 링크 |
| `frame-ancestors 'none'` / `object-src 'none'` / `base-uri 'self'` | 클릭재킹·플러그인·base 하이재킹 차단 |

## 전수 검색 결과 (2026-07-06)

대상: `index.html`, `admin/index.html`, `404.html`, `js/**`, `admin/**`, `functions/**`, `sw.js`

| 패턴 | 결과 | 비고 |
|---|---|---|
| 인라인 `<script>`(src 없음) | **2건 — 전부 JSON-LD** | `type="application/ld+json"`은 비실행 데이터 블록으로 CSP 차단 대상 아님 |
| `on*=` 인라인 HTML 핸들러 | **0건** | JS 파일 내 `script.onload/.onerror` 프로퍼티 할당은 인라인 핸들러가 아님(CSP 무관, 지연 로더 패턴) |
| `javascript:` URL | **0건** | |
| `eval` / `new Function` | **0건** | volt-data.js 파싱도 Node 스크립트에서 `vm` 샌드박스 사용 |
| 문자열 `setTimeout`/`setInterval` | **0건** | |
| 인라인 `style=` 속성 | **0건** | 동적 색상은 `data-style-bg/color` 속성 → JS가 style 프로퍼티로 적용 |
| `setAttribute('style')` / `.cssText` | **0건** | |

## 검증 방법

- **정적 게이트**: [tests/smoke/csp.spec.js](../tests/smoke/csp.spec.js)가 `_headers`의 CSP 라인을 직접 파싱해
  `unsafe-inline` 회귀를 소스 수준에서 차단한다 (누군가 되돌리면 테스트 실패).
- **런타임 게이트**: 같은 스펙이 강화 CSP를 문서 응답에 강제 주입한 뒤 핵심 화면(홈/함선DB/모달/검색/무역플래너)을
  구동해 `securitypolicyviolation` 이벤트 0건을 단언한다. Admin 폼 상호작용 포함.
- 실행: `npm test` (전체) 또는 `npx playwright test tests/smoke/csp.spec.js`.
- 새 코드 규칙: HTML 문자열 조립 시 `escapeHtml` 필수(래칫: `scripts/check-inner-html.mjs`),
  인라인 핸들러/스타일 금지, 외부 스크립트 추가 시 이 문서와 `_headers`를 함께 갱신.

## 남은 강화 후보 (보류 사유 포함)

| 후보 | 상태 | 사유 |
|---|---|---|
| `img-src https:` → 도메인 목록 고정 | 보류 | R2 공개 도메인·Discord CDN 목록 확정 필요. 위험도 낮음(이미지 로드뿐) |
| `Cross-Origin-Embedder-Policy` | 보류 | 외부 이미지(hotlink) 사용과 충돌. 필요 기능 없음 |
| CSP 위반 리포팅(`report-to`) | 후보 | Workers 엔드포인트 추가 시 관측 가능 — 현재는 Playwright 게이트로 대체 |
