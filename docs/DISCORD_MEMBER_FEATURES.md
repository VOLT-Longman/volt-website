# Discord 인증 기반 회원 기능

## 적용 범위

- 일정 RSVP: `/api/events/:id/rsvp`, `/api/me/rsvps`
- Discord 브리핑 전송: `/api/briefing/share`
- 사용자 선호 저장: `/api/me/preferences`
- 서버 권한 헬퍼: `functions/_shared/rbac.js`

## 필수 설정

1. D1 마이그레이션 적용

```bash
wrangler d1 execute <DB_NAME> --file ./migrations/0005_member_features.sql --remote
```

2. Cloudflare Pages 환경변수

- `DISCORD_OPERATION_WEBHOOK_URL` — 작전 브리핑을 보낼 Discord Webhook URL(Secret 권장)
- `ADMIN_DISCORD_ROLES` — 선택값. 예: `["대표이사","감찰","임원진"]`

## 주의

관리자 API를 Discord 역할 기반으로 여는 작업은 보안 범위가 넓어 별도 승인 후 적용한다. 현재 비밀번호 기반 관리자 인증은 유지한다.
