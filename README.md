# VOLT Fleet Website

한국 커뮤니티 Star Citizen 물류·무역 전문 함대 **VOLT**의 공식 홈페이지입니다.

## 📂 프로젝트 구조

```
volt-website/
├── index.html              # 메인 HTML (구조)
├── css/
│   └── styles.css          # 전체 스타일시트
├── js/
│   └── main.js             # 메인 스크립트 (네비게이션 + 동적 렌더링)
├── data/
│   └── volt-data.js        # 함대 데이터 (멤버, 연혁, 스트리머 등)
└── assets/
    └── images/
        ├── VOLT_logo.png       # 함대 로고
        ├── streamers/          # 스트리머 프로필 사진
        │   ├── perma.png
        │   ├── kookbap.png
        │   └── juikyeon.png
        └── leaders/            # 임원진 프로필 (향후 추가)
```

## 🛠️ 콘텐츠 수정 방법

### 임원진 정보 변경
`data/volt-data.js`의 `leadership` 배열을 수정합니다.

```javascript
{
    id: "coo",
    name: "가스펠",
    role: "COO · 운영총괄이사",
    discord: "@gospel0927",
    description: "...",
    duties: "..."
}
```

### 스트리머 추가/변경
`data/volt-data.js`의 `streamers` 배열을 수정하고, 프로필 사진을 `assets/images/streamers/`에 업로드합니다.

### 연혁 추가
`data/volt-data.js`의 `timeline` 배열에 새 항목 추가:

```javascript
{
    date: "2956.06",
    title: "새로운 이벤트",
    description: "이벤트 설명..."
}
```

## 🚀 배포

GitHub에 push하면 Cloudflare Pages가 자동으로 배포합니다.

## 🔮 향후 확장 계획

이 프로젝트는 **단계적 확장**을 염두에 두고 설계되었습니다.

### Phase 1 (현재) — 정적 사이트
- 모든 데이터가 `volt-data.js`에 하드코딩
- HTML/CSS/JS 분리 구조

### Phase 2 — 갤러리 업로드
- Supabase Storage 연동
- 함대원이 직접 사진 업로드

### Phase 3 — Discord OAuth + 관리자 페이지
- Supabase Auth + Discord 로그인
- 임원진이 웹에서 직접 콘텐츠 편집

### Phase 4 — 함대 운영 도구
- 무역허브 게시판
- 작전 일정 캘린더
- 함선/장비 데이터베이스

---

**© 2953–2956 VOLT FLEET · ALL RIGHTS RESERVED**
