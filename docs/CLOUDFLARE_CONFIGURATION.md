# Cloudflare 운영 설정 기록

2026-10-04 운영 대시보드에서 확인·수정한 설정이다. 비밀값과 운영 데이터 백업은 이 저장소에 포함하지 않는다.

## 적용된 설정

- SSL 모드를 Full (strict), 최소 TLS를 1.2로 설정했다. TLS 1.3과 HTTPS 강제 연결은 유지한다.
- 사용자 확인에 따라 Under Attack만 해제했다. 일반 DDoS 방어, Bot Fight Mode, Browser Integrity Check는 유지한다.
- 브라우저 캐시 TTL은 기존 응답 헤더를 존중하도록 바꿨다. HTML의 재검증과 버전이 붙은 자산의 장기 캐시 정책은 `_headers`에서 정한다.
- 잘못된 자기 자신으로의 리디렉션을 `https://volt.ceo/*` → `https://www.volt.ceo/${1}`으로 수정하고 활성화했다. 308 응답으로 요청 메서드와 본문을 유지하며 쿼리 문자열도 보존한다.
- 구형 `volt-discord-auth` Worker의 `www.volt.ceo/auth/*` 및 콜백 경로 연결을 해제했다. `/auth/*`는 GitHub와 함께 배포되는 Pages Functions가 처리한다. 구형 Worker 자체는 복구용으로 보존했다.
- `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `DISCORD_OPERATION_WEBHOOK_URL`을 Text에서 Secret으로 전환했다. 관리자가 새 관리자 세션 비밀값을 직접 저장했다. 기존 관리자 세션은 다시 로그인해야 한다.
- Pages Functions는 Fail closed로 설정했다. 무료 호출 한도가 소진되면 API 요청에 정적 페이지를 대신 반환하지 않는다.
- 갤러리 R2에 `images.volt.ceo`를 연결하고 최소 TLS 1.2를 설정했다. 새 업로드 기본 주소는 `R2_PUBLIC_BASE_URL=https://images.volt.ceo`다. 이전 공개 주소는 과거 콘텐츠·이력의 링크 보존을 위해 유지한다.
- `https://images.volt.ceo/gallery/*`에만 캐시 적합성을 설정했다. 원본 Cache-Control이 있으면 따르고, 없으면 상태별 기본 TTL을 사용한다. 실제 이미지 GET에서 MISS 다음 HIT를 확인했다. CMS·인증 API는 이 규칙에 포함되지 않는다.

환경변수와 바인딩 변경은 다음 Pages 배포부터 적용된다. 이 기록은 코드 배포와 운영 설정이 서로 다른 작업임을 구분한다.

## 이미지 주소 이전

`R2_PUBLIC_LEGACY_BASE_URLS`는 이전 업로드 기본 주소들의 JSON 배열이다. 같은 `GALLERY_BUCKET`에 연결된 주소만 등록한다. 외부 주소를 임의로 등록하면 안 된다. 현재 주소 및 최대 8개의 HTTPS 이전 주소 아래에서 CMS가 생성한 파일명만 업로드 소유권 확인 대상으로 인정한다. 잘못된 JSON, 인증정보·쿼리가 있는 주소는 무시한다.

이 허용 목록은 이전 사진의 썸네일 생성·소스 조회·교체 정리 기능이 새 도메인 이전 후에도 작동하게 한다. 정리 시 현재 콘텐츠와 전체 변경 이력에서 해당 파일 참조를 다시 확인하므로, 과거 버전 복구에 필요한 원본은 보존한다.

기존 이미지 8개가 새 도메인에서 200 응답하는 것을 확인한 뒤 갤러리 2건과 파트너 3건의 이미지 주소를 이전했다. 제목·본문·게시 상태와 R2 원본은 그대로 보존했으며 이전 주소는 변경 이력에 남는다.
주소 이전으로 변경 이력이 160건에서 165건으로 증가했으며 트리거 21개가 유지되는 것을 확인했다.

## 운영 DB 적용

- 사용자 테이블 10개, 기존 콘텐츠 160건을 로컬 비공개 백업으로 보존하고 SQLite 복원과 마이그레이션을 검증했다. Cloudflare 내부 메타데이터는 백업에 포함하지 않았다.
- 0009, 0011, 0012, 0013, 0015를 적용했다. 기존 0010의 열은 이미 존재하므로 ALTER를 반복하지 않고 대장만 보정했다.
- `cms_history` 시작 스냅샷 160건, 기록 트리거 21개, `idx_rsvp_user` 인덱스를 확인했다. 시작 스냅샷 이전의 변경은 소급 복원할 수 없다.
- 초기 마이그레이션 대장의 과거 항목 날짜는 이번 대장 보정 시각이다. 실제 과거 실행 시각을 의미하지 않는다.
- 고아 참가 기록이 없어 0014 삭제는 실행하지 않았다. `event_rsvps_orphan_backup`만 준비했다. 적용 대장에는 0014가 없다.

## 별도 운영 판단이 필요한 항목

- DNSSEC는 도메인 등록기관에 DS 레코드를 설정해야 완료된다. 등록기관을 확인하지 않은 상태에서 켜지 않았다.
- 메일 사용 여부가 확인되지 않아 MX·SPF·DMARC를 임의로 추가하지 않았다.
- 미리보기 배포에는 운영 DB와 비밀값을 복제하지 않았다. 관리자까지 검증하는 미리보기가 필요하면 별도 DB·R2·인증정보를 준비한다.
- 사용처가 확인되지 않은 기존 Worker, R2 원본 및 변경 이력을 삭제하지 않았다. Workers AI와 유료 기능도 활성화하지 않았다.

## 검증

- 문법·링크·마이그레이션 규약·HTML 사용 검사 및 린트 통과. 서버 테스트 207개와 Playwright 315개 통과.
- 운영 홈·관리자 화면·공개 콘텐츠 API의 정상 응답, 비로그인 관리자 API의 401 거부, 인증 API의 no-store를 확인했다.
- Discord 로그인 시작이 상태 쿠키와 함께 Discord로 이동하는 것을 확인했다. 실제 Discord 동의·콜백 로그인은 사용자 계정으로 별도 확인해야 한다.
- 대표 주소의 308 이동이 경로·쿼리를 보존하며, 기존 이미지 8개는 새 도메인에서 정상 응답한다.
- DB 백업 SQLite의 무결성 검사는 `ok`다. 운영 이미지 주소 변경 5건이 이력에 기록돼 전체 165건이다.

## 참고

- [Worker 경로](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [R2 공개 도메인](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Pages 실패 시 동작](https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed)
