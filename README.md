# VOLT Fleet Website

한국 커뮤니티 Star Citizen 물류·무역 전문 함대 **VOLT**의 공식 홈페이지입니다.

- 라이브 사이트: https://www.volt.ceo
- Discord: https://discord.gg/voltstarcitizen
- RSI 공식 페이지: https://robertsspaceindustries.com/orgs/VOLT

이 프로젝트는 별도 설치 과정 없이 동작하는 정적 웹사이트입니다. 복잡한 프로그램 설치나 빌드 없이, 파일을 수정한 뒤 GitHub `main` 브랜치에 올리면 Cloudflare Pages가 자동으로 배포합니다.

---

## 한눈에 보기

이 사이트는 크게 세 종류의 파일로 이루어져 있습니다.

| 파일 | 하는 일 | 보통 누가 수정하나요? |
|---|---|---|
| `data/volt-data.js` | 공지, 함선, FAQ, 스트리머 같은 실제 내용 저장 | 운영진이 가장 자주 수정 |
| `index.html` | 화면의 큰 틀과 섹션 배치 | 새 메뉴나 새 섹션이 필요할 때 |
| `css/styles.css` / `js/main.js` | 디자인과 동작 | 기능 수정이 필요할 때 |

가장 중요한 원칙은 하나입니다.

> **사이트 내용은 가능한 한 `data/volt-data.js`에서만 바꿉니다.**

공지 하나를 추가하거나, 함선 정보를 고치거나, FAQ 문구를 바꾸는 일은 대부분 이 파일 하나만 수정하면 됩니다.

---

## 현재 제공 기능

| 기능 | 설명 |
|---|---|
| 섹션형 홈페이지 | 메뉴를 누르면 같은 페이지 안에서 원하는 화면으로 전환 |
| 다크 / 라이트 테마 | 우측 상단 버튼으로 전환, 선택값 자동 저장 |
| 공지사항 | 최신 공지 4개를 먼저 보여주고 `더 보기`로 추가 표시 |
| 공지 태그 필터 | `전체 / 공지 / 정책 / 작전 / 시스템`으로 분류 |
| 함선 데이터베이스 | 검색, 필터, 정렬, 상세 모달 지원 |
| 전역 검색 | 우측 상단 검색 버튼 또는 `/` 키로 사이트 전체 검색 |
| FAQ | 질문을 클릭하면 답변이 열리는 아코디언 방식 |
| 운영정책 링크 복사 | 각 조항 옆 링크 버튼으로 바로가기 주소 복사 |
| 스트리머 섹션 | 공식 스트리머 카드와 푸터 링크 자동 동기화 |
| 갤러리 | 이미지 등록 시 자동 그리드 표시, 클릭 시 크게 보기 |
| 반응형 화면 | 모바일, 태블릿, 데스크탑에 맞춰 자동 조정 |
| 404 페이지 | 잘못된 주소 접속 시 전용 오류 페이지 표시 |

---

## 사이트 메뉴 구성

| 메뉴 | 내용 |
|---|---|
| 소개 | VOLT 소개, 핵심 가치, 함대 정보 |
| 연혁 | 주요 이정표 |
| 임원진 | 운영진 소개 |
| 공지 | 함대 소식 |
| 함선DB | 함선 검색과 상세 정보 |
| 일정 | 작전 및 이벤트 예정 |
| 무역허브 | 함대 전용 교역 시스템 안내 |
| 스트리머 | 공식 스트리머 소개 |
| 갤러리 | 활동 이미지 |
| 정책 | 운영정책 전문 |
| FAQ | 자주 묻는 질문 |
| 무역가이드 | 입문용 무역 안내 |
| 가입하기 | 지원 절차와 링크 |

---

## 폴더 구조

```text
volt-website/
├── index.html                  메인 페이지
├── 404.html                    잘못된 주소용 페이지
├── README.md                   이 안내 문서
├── css/
│   └── styles.css              디자인과 테마
├── js/
│   └── main.js                 메뉴 전환, 검색, 모달 등 기능
├── data/
│   └── volt-data.js            실제 사이트 내용
└── assets/
    └── images/
        ├── VOLT_logo.png       로고
        ├── streamers/          스트리머 이미지
        └── gallery/            갤러리 이미지
```

---

## 가장 자주 하는 수정 방법

### 1. 공지 추가하기

`data/volt-data.js`의 `announcements` 목록에 아래 형식으로 새 항목을 추가합니다.

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

- `tag`는 화면의 필터 버튼 이름과 연결됩니다.
- 현재 권장 태그는 `공지`, `정책`, `작전`, `시스템`입니다.
- 최근 날짜가 먼저 보이도록 작성하는 것을 권장합니다.

### 2. 작전 일정 추가하기

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

### 3. 함선 추가하기

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
    tags: ["화물", "무역"]
}
```

- `focus`는 현재 `물류`, `전투`, `탐사`, `채굴`, `해체` 중 하나를 쓰는 것이 가장 자연스럽습니다.
- `tags`는 함선 필터와 검색에 사용됩니다.

### 4. FAQ 추가하기

```javascript
{
    q: "질문 내용",
    a: "답변 내용"
}
```

### 5. 스트리머 추가하기

```javascript
{
    id: "streamer-id",
    name: "이름",
    platform: "치지직",
    description: "짧은 소개",
    image: "assets/images/streamers/example.png",
    channelUrl: "https://...",
    sections: [
        { title: "📢 소개", content: "내용" }
    ]
}
```

- 이미지는 `assets/images/streamers/` 폴더에 넣습니다.
- 푸터의 스트리머 링크는 자동으로 갱신됩니다.

### 6. 갤러리 이미지 추가하기

1. 이미지를 `assets/images/gallery/` 폴더에 넣습니다.
2. `data/volt-data.js`의 `gallery` 목록에 등록합니다.

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

- `thumb`는 썸네일 이미지입니다. 없으면 원본 이미지를 그대로 써도 됩니다.
- 등록된 이미지는 자동으로 갤러리에 표시됩니다.

---

## 수정할 때 꼭 지켜야 할 것

### 콘텐츠 수정 시

- 내용을 바꿀 때는 먼저 `data/volt-data.js`를 확인합니다.
- 따옴표, 쉼표를 빠뜨리면 사이트 전체가 멈출 수 있습니다.
- 이미지 경로는 실제 파일 위치와 정확히 같아야 합니다.

### 새 섹션을 만들 때

새 메뉴나 새 화면을 만들 때는 다음 파일을 함께 수정해야 합니다.

1. `data/volt-data.js` — 내용 추가
2. `index.html` — 섹션과 메뉴 추가
3. `js/main.js` — 렌더링 함수와 섹션 등록
4. `css/styles.css` — 디자인 추가

### 배포 후 확인할 것

배포가 끝나면 아래 순서로 확인하는 것이 좋습니다.

1. 메인 화면이 정상 표시되는지
2. 메뉴를 눌렀을 때 섹션이 잘 바뀌는지
3. 다크 / 라이트 테마가 모든 섹션에서 자연스럽게 전환되는지
4. 공지 필터, 함선 검색, FAQ, 검색창이 정상 동작하는지
5. 브라우저 새로고침 후에도 최신 파일이 보이는지

> 화면이 예전처럼 보이면 브라우저 캐시 때문일 수 있습니다. 강력 새로고침을 한 번 해보세요.

---

## 배포 방법

현재 배포 방식은 단순합니다.

1. 수정한 파일을 GitHub 저장소에 반영
2. `main` 브랜치에 push
3. Cloudflare Pages가 자동으로 배포
4. 보통 1~2분 뒤 `www.volt.ceo`에서 확인 가능

별도의 빌드 명령어는 없습니다.

---

## 기술 메모

- Vanilla HTML / CSS / JavaScript만 사용
- 프레임워크, 번들러, npm 사용 없음
- 콘텐츠 원본은 `window.VOLT_DATA`
- 메뉴 전환은 URL 해시 기반 SPA 방식
- 테마는 CSS 변수와 `localStorage`로 관리

---

## 향후 확장 아이디어

| 단계 | 아이디어 |
|---|---|
| 다음 | 실제 갤러리 이미지 채우기 |
| 이후 | 관리자용 편집 화면 |
| 이후 | Discord 로그인 연동 |
| 이후 | 무역허브 게시판 / 실시간 일정 |
| 장기 | 함대원 대시보드와 기여도 시스템 |

---

**© 2953–2956 VOLT FLEET · ALL RIGHTS RESERVED**
