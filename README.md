# VOLT Fleet Website

한국 커뮤니티 Star Citizen 물류·무역 전문 함대 **VOLT**의 공식 홈페이지입니다.

> Voyagers of Logistics & Trade  
> 물류와 무역을 위해 여행하는 항해자

- 라이브 사이트: https://www.volt.ceo
- Discord: https://discord.gg/voltstarcitizen
- RSI 공식 페이지: https://robertsspaceindustries.com/orgs/VOLT

이 저장소는 **Cloudflare Pages로 배포되는 정적 웹사이트**입니다. 별도 빌드 과정 없이 HTML, CSS, JavaScript, 데이터 파일을 수정한 뒤 `main` 브랜치에 반영하면 자동 배포됩니다.

---

## 현재 상태

| 항목 | 내용 |
|---|---|
| 사이트 유형 | 정적 SPA 스타일 공식 홈페이지 |
| 주 언어 | HTML / CSS / Vanilla JavaScript |
| 콘텐츠 데이터 | `data/volt-data.js`의 `window.VOLT_DATA` |
| 배포 | Cloudflare Pages |
| 기본 브랜치 | `main` |
| 최신 에셋 버전 | `20260517-14` |
| 분석 | Cloudflare Web Analytics 자동 설치 사용 |
| 보안 헤더 | `_headers`에서 관리 |

---

## 핵심 기능

| 기능 | 설명 |
|---|---|
| 섹션형 홈페이지 | 메뉴 선택 시 같은 페이지 안에서 섹션 전환 |
| URL 해시 라우팅 | `#about`, `#ships`, `#policy-section-1` 같은 직접 링크 지원 |
| 다크 / 라이트 테마 | 테마 전환 및 `localStorage` 저장 |
| 반응형 내비게이션 | 데스크톱 메뉴와 모바일 햄버거 메뉴 지원 |
| 전역 검색 | 공지, 함선, FAQ, 연혁, 정책 등 사이트 전체 검색 |
| 공지사항 | 태그 필터, 최신순 정렬, 더 보기 지원 |
| 함선 데이터베이스 | 검색, 역할 태그 필터, 제조사 필터, 미구현 제외, 정렬, 상세 모달 지원 |
| 일정 | 작전 및 이벤트 리스트 표시 |
| 운영정책 | 정책 전문 표시, 조항별 링크 복사 지원 |
| FAQ | 아코디언 방식의 질문/답변 UI |
| 무역가이드 | Star Citizen 물류·무역 입문 안내 |
| 스트리머 | 공식 스트리머 카드와 푸터 링크 자동 동기화 |
| 갤러리 | 이미지 등록 시 그리드와 라이트박스 자동 표시 |
| OG/Twitter 메타 | 링크 공유용 대표 이미지와 설명 제공 |
| PWA Manifest | 홈 화면 설치용 manifest와 아이콘 정보 제공 |
| 보안 헤더 | CSP Report-Only, HSTS, X-Frame-Options 등 적용 |

---

## 사이트 메뉴 구성

| 메뉴 | 목적 |
|---|---|
| 소개 | VOLT 소개, 핵심 가치, 함대 정보 |
| 연혁 | 함대 주요 이정표 |
| 임원진 | 운영진 및 역할 소개 |
| 공지 | 함대 소식과 정책/작전 안내 |
| 함선DB | Star Citizen 주요 함선 탐색 도구 |
| 일정 | 작전 및 이벤트 예정 |
| 무역허브 | 함대 전용 교역 시스템 안내 |
| 스트리머 | 공식 스트리머 소개 |
| 갤러리 | 활동 이미지 모음 |
| 정책 | 함대 운영정책 전문 |
| FAQ | 자주 묻는 질문 |
| 무역가이드 | 신규/입문자를 위한 무역 안내 |
| 가입하기 | 지원 절차, 지원서, Discord 링크 |

---

## 폴더 구조

```text
volt-website/
├── index.html                  메인 페이지와 섹션 구조
├── 404.html                    잘못된 주소 접근 시 표시되는 페이지
├── README.md                   프로젝트 운영 문서
├── _headers                    Cloudflare Pages 보안/캐시 헤더
├── manifest.json               PWA manifest
├── robots.txt                  검색 엔진 크롤링 안내
├── sitemap.xml                 검색 엔진용 사이트맵
├── sw.js                       서비스 워커 / 캐시 제어
├── css/
│   └── styles.css              디자인, 테마, 반응형, 접근성 스타일
├── js/
│   └── main.js                 렌더링, 검색, 모달, 메뉴, 테마 등 기능
├── data/
│   └── volt-data.js            공지, 함선, 일정, FAQ, 정책 등 실제 콘텐츠
└── assets/
    └── images/
        ├── VOLT_logo.png       기본 로고
        ├── VOLT_logo.webp      웹 최적화 로고
        ├── og-image.png        공유 미리보기 이미지
        ├── icons/              PWA 아이콘
        ├── streamers/          스트리머 이미지
        └── gallery/            갤러리 이미지
```

---

## 운영 원칙

가장 중요한 원칙은 다음과 같습니다.

> **콘텐츠 수정은 가능한 한 `data/volt-data.js`에서 처리합니다.**

공지, 일정, 함선, FAQ, 정책, 스트리머, 갤러리 데이터는 대부분 `data/volt-data.js`에서 관리합니다. 새 화면 구조가 필요할 때만 `index.html`, `js/main.js`, `css/styles.css`를 함께 수정합니다.

---

## 자주 하는 수정

### 1. 공지 추가

`data/volt-data.js`의 `announcements` 배열에 새 항목을 추가합니다.

```javascript
{
    id: "ann-007",
    date: "2026.06.01",
    title: "공지 제목",
    content: "공지 내용",
    tag: "공지",
    tagColor: "orange"
}
```

권장 태그는 다음과 같습니다.

```text
공지 / 정책 / 작전 / 시스템
```

공지는 날짜 기준 최신순으로 정렬됩니다.

---

### 2. 작전 일정 추가

`calendar` 배열에 새 항목을 추가합니다.

```javascript
{
    id: "cal-005",
    date: "2026.09",
    dateLabel: "2026년 9월 예정",
    title: "작전명",
    description: "작전 설명",
    type: "작전",
    status: "예정"
}
```

권장 상태값은 다음과 같습니다.

```text
예정 / 대기 / 계획
```

---

### 3. 함선 추가

`ships` 배열에 새 함선 정보를 추가합니다.

```javascript
{
    id: "ship-id",
    name: "함선명",
    manufacturer: "제조사",
    role: "역할",
    focus: "물류",
    size: "대형",
    crew: "2-4명",
    cargo: "4,608 SCU",
    description: "함선 설명",
    tags: ["화물", "무역"],
    rsiUrl: "https://robertsspaceindustries.com/..."
}
```

함선 DB에서 사용되는 주요 값은 다음과 같습니다.

| 필드 | 사용 위치 |
|---|---|
| `name` | 카드 제목, 검색 |
| `manufacturer` | 제조사 필터, 검색 |
| `role` | 카드 스탯, 검색 |
| `focus` | 카드 배지 |
| `size` | 정렬, 상세 모달 |
| `crew` | 정렬, 상세 모달 |
| `cargo` | 정렬, 상세 모달 |
| `tags` | 역할 필터, 미구현 제외, 검색 |
| `rsiUrl` | 상세 모달의 공식 링크 |

`rsiUrl`이 없으면 상세 모달은 RSI 함선 매트릭스로 연결됩니다.

미구현 함선은 `tags`에 `"미구현"`을 넣습니다.

```javascript
tags: ["화물", "미구현"]
```

---

### 4. FAQ 추가

`faq` 배열에 새 항목을 추가합니다.

```javascript
{
    q: "질문 내용",
    a: "답변 내용"
}
```

FAQ는 전체 검색에도 자동 포함됩니다.

---

### 5. 스트리머 추가

`streamers` 배열에 새 항목을 추가합니다.

```javascript
{
    id: "streamer-id",
    name: "이름",
    platform: "치지직",
    description: "짧은 소개",
    image: "assets/images/streamers/example.png",
    imagePosition: "center center",
    channelUrl: "https://...",
    sections: [
        { title: "📢 소개", content: "내용" }
    ]
}
```

- 이미지는 `assets/images/streamers/`에 넣습니다.
- `imagePosition`은 얼굴이나 주요 피사체 위치가 잘 보이도록 조정할 때 사용합니다.
- 푸터 스트리머 링크는 자동 갱신됩니다.

---

### 6. 갤러리 이미지 추가

1. 이미지를 `assets/images/gallery/`에 업로드합니다.
2. `gallery` 배열에 항목을 추가합니다.

```javascript
{
    id: "gallery-001",
    src: "assets/images/gallery/lazarus-raid.jpg",
    thumb: "assets/images/gallery/lazarus-raid-thumb.jpg",
    title: "Lazarus Complex 레이드",
    date: "2025.08.02",
    description: "하반기 첫 공식 단체 작전"
}
```

- `src`는 원본 이미지입니다.
- `thumb`는 썸네일 이미지입니다.
- `thumb`가 없으면 `src`를 그대로 사용해도 됩니다.
- 권장 포맷은 `webp`입니다.

---

### 7. 운영정책 수정

`policy.sections`에서 조항을 수정합니다.

```javascript
{
    title: "3조 · 닉네임 규정",
    notice: "디스코드 이름은 인게임 핸들 닉네임과 통일해야 합니다. 예시: 롱만(VOLT_Longman)",
    items: [
        { num: "금지", text: "운영진을 사칭하거나 오해를 유발하는 닉네임" }
    ]
}
```

정책 조항은 사이트에서 링크 복사 기능과 연결됩니다.

---

## 새 기능을 추가할 때

새 섹션이나 기능을 추가할 때는 보통 아래 파일을 함께 수정합니다.

| 파일 | 수정 내용 |
|---|---|
| `data/volt-data.js` | 기능에 필요한 데이터 구조 추가 |
| `index.html` | 섹션, 버튼, 입력창, 메뉴 추가 |
| `js/main.js` | 렌더링 함수, 이벤트 핸들러, 상태값 추가 |
| `css/styles.css` | UI 스타일, 반응형, 라이트 모드 보정 추가 |

`main.js`에서 새 섹션을 라우팅하려면 `VALID_SECTIONS`에도 섹션 ID를 추가해야 합니다.

---

## 배포 방법

현재 배포는 다음 흐름입니다.

```text
1. 파일 수정
2. GitHub main 브랜치에 반영
3. Cloudflare Pages 자동 배포
4. https://www.volt.ceo 에서 확인
```

별도의 빌드 명령어는 없습니다.

---

## 배포 전 체크리스트

배포 전에는 아래 항목을 확인합니다.

```text
□ index.html 문법 오류 없음
□ data/volt-data.js 쉼표, 따옴표, 배열 구조 오류 없음
□ 새 이미지 경로가 실제 파일 위치와 일치함
□ CSS/JS 수정 후 캐시 버전 쿼리 갱신
□ 다크 모드와 라이트 모드 모두 확인
□ 모바일 480px / 768px 폭 확인
□ 검색, 필터, 모달, FAQ, 메뉴 동작 확인
□ 외부 링크 target="_blank" + rel="noopener noreferrer" 확인
```

---

## 배포 후 확인

배포 후 라이브 사이트에서 아래를 확인합니다.

```text
□ 메인 화면 로고와 히어로 영역 정상 표시
□ 상단 메뉴와 모바일 메뉴 정상 동작
□ 공지 태그 필터와 더 보기 정상 동작
□ 함선 검색 / 역할 필터 / 제조사 필터 / 미구현 제외 / 정렬 정상 동작
□ 함선 상세 모달과 RSI 링크 정상 동작
□ 전역 검색 열기, 검색 결과 이동 정상 동작
□ FAQ 아코디언 정상 동작
□ 정책 링크 복사 정상 동작
□ 라이트 모드에서 select, 카드, 텍스트 대비 정상
□ Discord, 지원서, RSI 링크 정상 연결
```

최신 파일 반영 여부는 페이지 소스에서 아래 버전을 확인합니다.

```html
css/styles.css?v=20260517-14
data/volt-data.js?v=20260517-14
js/main.js?v=20260517-14
```

---

## 캐시와 버전 관리

정적 에셋은 강한 캐시가 적용될 수 있으므로 CSS, JS, 데이터 파일을 수정한 경우 `index.html`의 버전 쿼리를 갱신합니다.

```html
<link rel="stylesheet" href="css/styles.css?v=YYYYMMDD-N">
<script src="data/volt-data.js?v=YYYYMMDD-N"></script>
<script src="js/main.js?v=YYYYMMDD-N"></script>
```

버전 예시는 다음과 같습니다.

```text
20260517-14
```

브라우저에 이전 화면이 보이면 강력 새로고침을 하거나 Cloudflare 캐시 상태를 확인합니다.

---

## Cloudflare Web Analytics

현재 사이트는 **Cloudflare Web Analytics 자동 설치(auto install)**를 사용하는 방향입니다.

따라서 `index.html`에 Web Analytics 스크립트를 수동으로 넣지 않습니다. 자동 설치와 수동 스크립트를 동시에 사용하면 방문이 중복 집계될 수 있습니다.

```text
권장 상태:
Cloudflare Web Analytics auto_install ON
index.html 수동 beacon 스크립트 없음
```

---

## 보안 헤더와 CSP

보안/캐시 헤더는 `_headers`에서 관리합니다.

현재 주요 헤더는 다음과 같습니다.

| 헤더 | 목적 |
|---|---|
| `X-Content-Type-Options: nosniff` | MIME sniffing 방지 |
| `X-Frame-Options: DENY` | iframe 삽입 방지 |
| `Referrer-Policy: strict-origin-when-cross-origin` | referrer 노출 최소화 |
| `Permissions-Policy` | 카메라, 마이크, 위치 권한 차단 |
| `Strict-Transport-Security` | HTTPS 강제 |
| `Cross-Origin-Opener-Policy: same-origin` | 브라우징 컨텍스트 격리 강화 |
| `Content-Security-Policy-Report-Only` | CSP 위반을 관찰 모드로 점검 |

현재 CSP는 Report-Only입니다. 충분히 확인한 뒤 강제 `Content-Security-Policy`로 전환하는 것이 안전합니다.

---

## SEO / 공유 메타

`index.html`에는 다음 메타 정보가 포함되어 있습니다.

- `description`
- `canonical`
- Open Graph title / description / image
- Twitter card / image
- Organization JSON-LD
- FAQPage JSON-LD 동적 삽입
- Event JSON-LD 동적 삽입

공유 이미지는 아래 파일을 사용합니다.

```text
assets/images/og-image.png
```

공유 이미지 변경 시 `og:image`, `twitter:image`, 실제 이미지 파일을 함께 확인합니다.

---

## 접근성 기준

현재 사이트는 다음 접근성 처리를 포함합니다.

- 키보드 포커스 표시
- 모바일 메뉴 focus trap
- 검색 오버레이 dialog 속성
- FAQ `aria-expanded` / `aria-controls`
- 이미지 `alt`
- `prefers-reduced-motion` 대응
- 버튼 `aria-label`

새 기능을 추가할 때는 다음을 지킵니다.

```text
□ 버튼에는 목적이 드러나는 텍스트 또는 aria-label 사용
□ 모달/오버레이는 Escape로 닫기 지원
□ 키보드만으로 조작 가능해야 함
□ 라이트 모드에서도 텍스트 대비 확인
□ 애니메이션은 prefers-reduced-motion을 고려
```

---

## 기술 메모

- 프레임워크 없음
- 번들러 없음
- npm 설치 없음
- Vanilla HTML / CSS / JavaScript 기반
- 데이터 원본은 `window.VOLT_DATA`
- URL 해시 기반 섹션 라우팅
- `localStorage` 기반 테마 저장
- `IntersectionObserver` 기반 reveal 애니메이션
- Cloudflare Pages `_headers` 사용

---

## 추천 개발 로드맵

| 우선순위 | 작업 | 목적 |
|---|---|---|
| 1 | 갤러리 이미지 6~8장 등록 | 실제 활동감과 신뢰도 강화 |
| 2 | 갤러리 카테고리 | 이미지가 늘어났을 때 탐색성 개선 |
| 3 | 함선 비교 기능 | 함선 DB를 도구형 기능으로 확장 |
| 4 | 가입 전 체크리스트 | 신규 유저 전환율 개선 |
| 5 | 신규 유저 온보딩 가이드 | Star Citizen 진입장벽 완화 |
| 6 | 공지 고정 / 상세 모달 | 운영 공지 전달력 강화 |
| 7 | Playwright 기본 테스트 | 기능 회귀 방지 |
| 8 | Lighthouse CI | 성능, 접근성, SEO 품질 관리 |
| 9 | CSP 리포트 수집 | 보안 헤더 운영 안정화 |
| 10 | Vite 전환 브랜치 | 장기 유지보수성과 모듈화 개선 |

---

## 작업 시 주의사항

- `data/volt-data.js`는 JavaScript 파일이므로 JSON과 달리 끝 쉼표, 따옴표 오류에 주의합니다.
- 사용자 입력이 들어갈 가능성이 있는 데이터는 `main.js`에서 `escapeHtml()`을 거쳐 출력해야 합니다.
- 외부 링크는 `target="_blank"` 사용 시 `rel="noopener noreferrer"`를 함께 넣습니다.
- Cloudflare Analytics는 자동 설치 정책을 유지합니다.
- 대규모 구조 변경, Vite 전환, 관리자 페이지 도입은 별도 브랜치에서 진행하는 것을 권장합니다.

---

## 라이선스 / 권리

이 저장소의 사이트 코드와 콘텐츠는 VOLT Fleet 운영 목적에 맞춰 관리됩니다. 로고, 이미지, 문구, 함대 운영정책 등 브랜드 자산은 무단 사용하지 않는 것을 원칙으로 합니다.
