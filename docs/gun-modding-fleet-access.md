# 함대원 전용 총기 개조 — 배포 준비 (2026-11-19)

## 운영자 설정이 필요한 항목

1. **비공개 R2 버킷 `volt-fleet-gear`** 생성. `r2.dev` 공개 접근과 사용자 지정 도메인을 모두 연결하지 않는다. 기존 공개 `volt-gallery`를 사용하지 않는다.
2. Pages 프로젝트 **`volt-website`**(기본 호스트 `volt-ceo.pages.dev`)의 Production 및 검수에 사용할 Preview 환경에 R2 바인딩 **`FLEET_GEAR_MODELS` → `volt-fleet-gear`** 추가. 프로젝트 이름과 기본 호스트 이름은 다르며 2026-11-19 대시보드에서 확인했다.
3. `DISCORD_FLEET_ROLE_ID`는 생략하면 운영자가 확정한 `1120508650520330310`을 사용한다. 다른 값은 기본값을 대체하며, 빈 값은 접근을 차단한다. 기존 커뮤니티 역할 `1150059971887771718`과 공개 전환 스위치는 이 기능에 영향을 주지 않는다.
4. 업로드 전용 R2 자격 증명은 이 버킷에만 한정한다. 실행 환경에 `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`를 설정한다. 키를 Git·대화·명령 인수에 넣지 않는다. 다른 버킷 이름이면 `FLEET_GEAR_BUCKET`도 설정한다.

공식 설정 참고: [Pages R2 바인딩](https://developers.cloudflare.com/pages/functions/bindings/#r2-buckets), [R2 S3 SDK](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).

## 모형 업로드와 검증

`assets/models/gear/`는 `.gitignore` 대상이며 공개 저장소의 커밋에 포함하지 않는다. 원래 미공개 커밋은 모형을 뺀 뒤 최신 main 위에 다시 만들었다. 해당 브랜치에서 아래 검사를 실행한다.

```powershell
node scripts/gear/check-private-models.mjs
node scripts/gear/upload-models.mjs
node scripts/gear/upload-models.mjs --upload
node scripts/gear/upload-models.mjs --verify
```

인수가 없는 실행은 로컬 파일 검사만 한다. `--upload`는 현재 `models.json`의 `assetVersion` 폴더 아래 올리고, 매 파일을 다시 받아 SHA-256을 확인한다. 같은 버전의 다른 파일은 덮어쓰지 않는다. 마지막에 `_release.json`에 파일별 해시와 `models.json` 해시를 기록한다. `--verify`는 업로드 없이 모든 원격 파일과 목록을 다시 비교한다. 내보내기로 버전이 바뀌면 새 폴더에 다시 업로드하고 확인한 뒤 코드와 함께 배포한다.

현재 로컬 준비물: `4.10.200.58746-mwm7s08x`, 531개 파일, 79,116,473바이트. 실제 R2 업로드 여부와는 별도다.

내보내기는 서버용 `gear-model-version.js`도 자동 생성한다. `npm run check`에서 `models.json`과 일치를 검사한다. Cloudflare Pages가 사용하는 Wrangler 3.114.17은 JSON의 `with` import 문법을 읽지 못하므로, 서버는 생성된 일반 JS 파일에서 버전만 가져온다.

## 접근 제어

- `/auth/me`의 `features.gunModding`이 `true`인 로그인 사용자만 개조 자료와 3D 코드를 요청한다. 역할 이름이나 관리자 권한으로 예외를 주지 않는다.
- `/assets/models/gear/**`, `/data/gear/models.json`, `/data/gear/attachments.json`은 루트 미들웨어에서 파일·R2보다 먼저 검사한다. GET/HEAD 모두 비로그인 401, 함대원 역할 없음 403, 인증 또는 설정 오류 503이다. Preview 호스트에도 같은 규칙이 적용된다.
- R2 모형은 현재 `assetVersion`의 경로와 객체 메타데이터가 맞아야 한다. R2 미연결·오류·누락 때 정적 파일로 우회하지 않는다. 화면은 기존 장비 그림으로 대신한다.
- 모든 보호 응답: `Cache-Control: private, no-store`, `CDN-Cache-Control: no-store`, `Cloudflare-CDN-Cache-Control: no-store`, `Vary: Cookie`. 로그아웃 후 HTTP 캐시 사본도 남기지 않는 쪽을 선택했다. 열린 뷰어 안에서는 메모리의 모형을 재사용한다.
- 서비스 워커는 보호 파일을 저장하거나 읽지 않는다. 새 캐시 버전 활성화 시 과거 VOLT 캐시를 지운다. CSP는 변경하지 않는다.
- Discord가 검증한 역할 목록을 최대 5초 재사용한다. 개인 장비 화면을 보고 있을 때 15초 간격 및 창 복귀 시 권한을 다시 확인한다. 로그아웃·역할 회수·인증 오류 확인 시 모형과 부착물 자료를 메모리에서 해제하고 안내로 바꾼다. Discord 역할 변경을 즉시 통지받는 방식은 아니다.
- 공유 주소는 총기 및 세 부착물의 제한된 식별자만 로그인 복귀 주소로 허용한다. 외부 주소나 임의 파라미터는 허용하지 않는다.

## 시험 구분

- 서버 시험: 역할·401/403/503·환경 변수·공개 스위치·인코딩 경로·미리보기·HEAD·캐시 머리글·R2 버전/오류·OAuth 복귀 주소.
- 화면 시험: 비회원 요청 0건, 공유 주소, 상세 버튼, 한국어/영어, 모바일, 권한 회수/로그아웃, 3D 표시·교체, 대체 그림, CSP.
- 이 PC에서는 비공개 로컬 모형으로 3D 표시를 확인한다. 공개 CI에는 게임 모형을 전달하지 않는다. 로컬 모형이 없는 환경의 화면 시험은 직접 만든 단순 상자를 사용해 뷰어와 접근 제어를 확인한다. CI 결과가 실제 모형의 색·재질을 검증한 것은 아니다.
- 색·재질·일부 총열 하부 부품 위치 등 기존 알려진 표현 한계는 이번 변경 범위 밖이다.
- 기존 개조 화면이 변화율을 곱해 표시하던 ‘적용 후’ 추정 수치는 제거했다. 검증되지 않은 중첩 계산 대신 각 부착물의 게임 기록값을 따로 표시한다.

## 라이브 승인 뒤 확인

1. 운영자가 위 R2 설정을 마친 뒤 업로드·전체 파일 검증.
2. 최신 main을 다시 fetch하고 충돌/동시 변경 확인. 승인된 코드의 전체 시험 통과 뒤 main 반영 및 배포.
3. 비로그인 GET/HEAD로 두 메타데이터와 실제 모형/텍스처 주소가 401이고 공개 캐시 머리글이 없는지 확인.
4. 커뮤니티 역할만 있는 계정은 403, 함대원 계정은 개조 화면과 R2 모형이 표시되는지 확인. 첫 화면에서 개조 관련 요청은 0건.
5. 실시간 Discord 역할 회수 및 로그아웃, 공유 주소 로그인 복귀는 실제 계정으로 별도 확인한다.

사용자가 준 인계 지시문 4-4에 따라 **운영자 보고와 허락 전에는 main 반영·라이브 배포를 하지 않는다.**
