# VOLT 관리자 CMS 1차 구축 계획

> 이 작업은 **volt-website-copy에서만 진행한다**. 원본 `volt-website-main` 또는 안정화된 원본 프로젝트 파일은 수정하지 않는다.

## 목표

운영진이 코드 수정 없이 공지, 일정, 갤러리를 작성/수정/삭제할 수 있도록 Cloudflare Pages Functions, D1, R2 기반 CMS 1차 구조를 만든다.

## 범위

- `/admin` 관리자 페이지
- 관리자 로그인/로그아웃/세션 확인
- 공지/일정/갤러리 CRUD
- R2 이미지 업로드
- 공개 API: `/api/notices`, `/api/events`, `/api/gallery`
- 공개 사이트 API 우선 로딩 + 정적 데이터 fallback
- D1 seed 생성 스크립트

## 제외 범위

함선DB 관리자, UEX 데이터 관리자, Discord 로그인/봇, 권한 세분화, WYSIWYG, Vite 전환, 원본 사이트 직접 반영.

## 데이터 흐름

```text
/admin 관리자 UI
→ /api/admin/* Pages Functions
→ D1 DB / R2 Storage
→ 공개 API
→ 공개 사이트 렌더링
→ 실패 시 data/volt-data.js fallback
```

## D1 테이블

- `notices`: id, title, content, tag, pinned, published, date, created_at, updated_at
- `events`: id, title, description, type, status, date_label, event_date, published, created_at, updated_at
- `gallery_items`: id, title, description, category, image_url, thumb_url, date, sort_order, published, created_at, updated_at
- `admin_users`: 장기 전환용. 1차는 환경변수 인증을 사용한다.

## 인증

- `ADMIN_PASSWORD` 또는 `ADMIN_TOKEN` 환경변수 사용
- 로그인 성공 시 httpOnly 세션 쿠키 발급
- `ADMIN_SESSION_SECRET`이 있으면 HMAC 서명에 사용
- 관리자 API는 인증 실패 시 401 반환

## R2 저장

- binding: `GALLERY_BUCKET`
- 공개 URL env: `R2_PUBLIC_BASE_URL`
- 경로: `gallery/{timestamp}-{uuid}.{ext}`
- 허용: jpg, jpeg, png, webp
- 제한: 10MB

## fallback 정책

공개 사이트는 API를 먼저 호출한다. API 실패 시 기존 `window.VOLT_DATA`의 `announcements`, `calendar`, `gallery`를 그대로 사용한다.
