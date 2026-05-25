# VOLT 관리자 CMS 운영 문서

> 이 문서는 `volt-website-copy` CMS 실험본 기준이다. 원본 반영은 별도 승인 후 진행한다.

## 로그인

1. `/admin/` 접속
2. Cloudflare 환경변수 `ADMIN_PASSWORD` 또는 `ADMIN_TOKEN` 값 입력
3. 공지, 일정, 갤러리 관리

## 콘텐츠 관리

- 공지: 제목, 내용, 태그, 날짜, 고정, 게시 상태
- 일정: 제목, 설명, 유형, 상태, 표시 날짜, 실제 날짜, 게시 상태
- 갤러리: 이미지 업로드, 제목, 설명, 카테고리, 날짜, 정렬 순서, 게시 상태

## 배포 환경변수

- `DB`: D1 binding
- `GALLERY_BUCKET`: R2 binding
- `ADMIN_PASSWORD` 또는 `ADMIN_TOKEN`
- `ADMIN_SESSION_SECRET`
- `R2_PUBLIC_BASE_URL`

## 장애 확인

공개 API 장애 시 공개 사이트는 정적 데이터를 fallback으로 사용해야 한다.

## 원본 반영 전 검수

관리자 로그인, CRUD, 이미지 업로드, 공개 API, fallback, 모바일 기본 사용성, 원본 프로젝트 무변경 여부를 확인한다.
