# VOLT Fleet Website

> 한국 커뮤니티 Star Citizen 물류·무역 전문 함대 **VOLT**의 공식 홈페이지

🌐 **[volt.ceo](https://www.volt.ceo)** · 💬 **[Discord](https://discord.gg/voltstarcitizen)** · 🚀 **[RSI 공식 페이지](https://robertsspaceindustries.com/orgs/VOLT)**

---

## 📂 프로젝트 구조

```
volt-website/
├── index.html                  # 메인 HTML (SPA 구조)
├── 404.html                    # 커스텀 404 에러 페이지
├── css/
│   └── styles.css              # 전체 스타일시트 (CSS 변수 기반 테마 포함)
├── js/
│   └── main.js                 # 메인 스크립트 (렌더링 + 네비게이션 + 기능)
├── data/
│   └── volt-data.js            # 함대 데이터 (단일 진실 공급원)
└── assets/
    └── images/
        ├── VOLT_logo.png
        ├── streamers/          # 스트리머 프로필 이미지
        │   ├── perma.png
        │   └── kookbap.png
        └── leaders/            # 임원진 프로필 (추가 예정)
```

---

## 🗂️ 섹션 구성

| 섹션 ID | 이름 | 설명 |
|---|---|---|
| `about` | 소개 | 함대 소개, 핵심 가치, 부서 |
| `timeline` | 연혁 | 함대 주요 이정표 |
| `leadership` | 임원진 | 운영진 카드 |
| `notices` | 공지사항 | 최근 함대 소식 |
| `ships` | 함선 DB | 필터·검색 지원 함선 데이터베이스 |
| `schedule` | 작전 일정 | 예정 작전 및 이벤트 |
| `hub` | 무역허브 | 함대 전용 교역 시스템 안내 |
| `policy` | 운영정책 | 전문 (2026.05.15 시행) |
| `faq` | FAQ | 자주 묻는 질문 아코디언 |
| `streamers` | 스트리머 | 공식 스트리머 카드 |
| `guide` | 무역 가이드 | 무역·물류 입문 안내 |
| `gallery` | 갤러리 | 활동 사진 (업로드 예정) |
| `join` | 가입하기 | 지원 절차 및 CTA |

---

## 🛠️ 콘텐츠 수정 방법

**모든 콘텐츠는 `data/volt-data.js` 한 파일에서 관리합니다.**  
HTML이나 JS를 건드릴 필요 없이, 아래 배열만 수정하면 자동으로 반영됩니다.

### 임원진 추가/변경
```javascript
// data/volt-data.js > leadership 배열
{
    id: "coo",
    name: "가스펠",
    role: "COO · 운영총괄이사",
    avatar: "G",
    avatarGradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    discord: "@gospel0927",
    description: "조직 운영 표준을 수립하고...",
    duties: "운영 시스템 개선 및 표준 수립 · ..."
}
```

### 스트리머 추가/변경
```javascript
// data/volt-data.js > streamers 배열
{
    id: "perma",
    name: "페르마",
    platform: "치지직",
    description: "소개 문구",
    image: "assets/images/streamers/perma.png",  // 이미지 파일도 업로드 필요
    channelUrl: "https://chzzk.naver.com/...",
    sections: [
        { title: "📢 섹션 제목", content: "내용" }
    ]
}
```
> 푸터 스트리머 링크는 이 배열에서 **자동 동기화**됩니다. 별도로 수정할 필요 없습니다.

### 연혁 추가
```javascript
// data/volt-data.js > timeline 배열
{
    date: "2956.06",
    title: "새로운 이벤트",
    description: "이벤트 설명..."
}
```

### 공지사항 추가
```javascript
// data/volt-data.js > announcements 배열
{
    id: "ann-007",
    date: "2026.06.01",
    title: "공지 제목",
    content: "공지 내용...",
    tag: "공지",               // 태그 텍스트
    tagColor: "orange"         // orange | red | blue | green
}
```

### 작전 일정 추가
```javascript
// data/volt-data.js > calendar 배열
{
    id: "cal-005",
    date: "2026.09",
    dateLabel: "2026년 9월 예정",
    title: "작전명",
    description: "작전 설명...",
    type: "작전",              // 작전 | 이벤트 | 프로젝트 | 정책
    status: "예정"             // 예정 | 대기 | 계획
}
```

### 함선 DB 추가
```javascript
// data/volt-data.js > ships 배열
{
    id: "ship-id",
    name: "함선명",
    manufacturer: "제조사",
    role: "역할",
    focus: "물류",             // 물류 | 전투 | 탐사 | 채굴
    size: "대형",
    crew: "2-4명",
    cargo: "4,608 SCU",
    description: "함선 설명...",
    tags: ["화물", "무역"]
}
```

### FAQ 추가
```javascript
// data/volt-data.js > faq 배열
{
    q: "질문 내용",
    a: "답변 내용"
}
```

---

## ⚙️ 기능 목록 (v2)

| 기능 | 설명 |
|---|---|
| SPA 라우팅 | URL 해시 기반 섹션 전환, 뒤로가기/앞으로가기 지원 |
| 다크/라이트 테마 | CSS 변수 기반, 설정 로컬 저장 |
| 로딩 스플래시 | VOLT 로고 + 프로그레스 바 |
| 스크롤 상단 버튼 | 300px 이상 스크롤 시 표시 |
| 스크롤 reveal | Intersection Observer 기반 카드 진입 애니메이션 |
| 활성 nav 링크 | 현재 섹션 nav 하이라이트 |
| 함선 DB 필터/검색 | 역할 필터 + 실시간 텍스트 검색 |
| FAQ 아코디언 | 클릭 시 펼침/닫힘, 하나만 열림 |
| 404 페이지 | VOLT 스타일 커스텀 에러 페이지 |
| 푸터 동적 렌더링 | 스트리머 데이터와 자동 동기화 |

---

## 🚀 배포

GitHub `main` 브랜치에 push하면 **Cloudflare Pages**가 자동으로 빌드 및 배포합니다.  
별도의 빌드 명령어 없음 — 정적 파일 그대로 서빙.

```
도메인: volt.ceo / www.volt.ceo
플랫폼: Cloudflare Pages
브랜치: main (자동 배포)
```

---

## 🔮 향후 확장 계획

| Phase | 내용 | 상태 |
|---|---|---|
| **Phase 1** | 정적 사이트 (현재) | ✅ 완료 |
| **Phase 2** | 갤러리 이미지 업로드 (Supabase Storage) | 🔜 예정 |
| **Phase 3** | Discord OAuth 로그인 + 관리자 편집 페이지 | 🔜 예정 |
| **Phase 4** | 무역허브 게시판, 실시간 작전 캘린더 | 🔜 예정 |
| **Phase 5** | 함대원 대시보드, 포인트/기여도 시스템 | 💡 검토 중 |

---

**© 2953–2956 VOLT FLEET · ALL RIGHTS RESERVED**
