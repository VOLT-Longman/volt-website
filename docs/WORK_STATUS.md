# 작업 상태 — 2026-07-14

## 진행 — ShipDB Erkul 재작성 v2 (0단계·1단계 완료, 2단계 대기) (2026-07-18)

- **상태**: 감사·계획·0단계 게이트·**1단계 병렬 데이터셋 생성 완료**. 라이브 무변경(비활성 병렬 파일). **초기화·삭제·2단계 소비처 이관은 미착수.**
- **문서**: [`shipdb-erkul-rewrite-audit.md`](shipdb-erkul-rewrite-audit.md)(감사+PM 9결정) / [`shipdb-erkul-rewrite-plan.md`](shipdb-erkul-rewrite-plan.md)(0~3단계) / [`shipdb-rewrite-consumer-map.md`](shipdb-rewrite-consumer-map.md)(288 소비처) / [`shipdb-rewrite-id-mapping.md`](shipdb-rewrite-id-mapping.md)(219/37).
- **0단계 산출**: 기준선(`capture-baseline.mjs`+`data/shipdb-rewrite-baseline.json`), 파이프라인 차단 CI(`canonical-contract.mjs`+`shipdb-canonical-contract.test.mjs`, 7종), ID 매핑, 소비처 맵.
- **1단계 산출(비활성)**: `scripts/shipdb-rewrite/build-{canonical,localization,operational}.mjs` → `data/canonical/`(ships-canonical 219·localization-ships 219·operational-ships 219·edition-aliases 7). canonical 사실원=Erkul live 레이어만(CI 강제). **localization KO 누락 8척 = 전환 차단 대상**(3.2 게이트).
- **PM 결정 요약**: Erkul=유일 사실, ship.id 유지, 3계층. canonical 선정=Erkul live 존재(railen 포함, matched 아님). crew→live 통일, priceUsd→모델 제거, erkulName/erkulStatus→operational 격리(삭제 안 함), anomalies→admin 리포트, focus/role/tags VOLT분류→초기 전환본 제거, live 없는 37→공개 제외. 레거시 재생성 4스크립트 퇴역은 2.7.
- **RSI 공식 카탈로그(2026-07-18 PM)**: 30척 "완전 제외" → RSI 공식 카탈로그 격리. 사실원=RSI Ship Matrix(`data/external/rsi/official-ship-matrix.json` 스냅샷·retrievedAt 2026-07-18). `build-rsi-official.mjs`→`data/canonical/ships-rsi-official.json`(30, RSI 필드만·게임플레이 값 없음, CI 가드). 감사표 `docs/shipdb-rsi-official-audit.md`. **catalogStatus(PM A, 정확성)**: concept 28="컨셉·RSI 공식 사양·변경 가능" / flight-ready 2(`atls`·`atls-geo`)="출시·RSI 공식 사양". **빈값(임의보완 금지)**: expanse 설명 없음 / atls·g12a·g12r 화물 null / g12·g12a·g12r·kraken·kraken-privateer 승무원 일부 null.
- **①29척 KO 번역 완료(PM A 순서 1)**: `build-rsi-official-localization.mjs`→`data/canonical/localization-rsi-official.json`(ok 29·no-en 1[expanse]·missing 0·cutoverReady). 병렬 번역+적대검증(g12r·pioneer 의미왜곡 2건 수정), HTML 엔티티 디코드(endeavor `&amp;`), 기계검증 고유명 29/29. 계약 9종.
- **②로더+비공개 플래그 완료(PM 재정렬 순서 1)**: `js/shipdb-canonical.js` — 내부 전환값 기본 OFF(URL·스토리지로 못 켬), ON은 테스트 훅(`__VOLT_SHIPDB_CANONICAL_TEST__`)만. OFF=fetch 0·store 비움·라이브 불변, ON=6계층 로드(canonical 219·localization 219·operational 219·aliases 7·rsi-official 30·rsi-localization 30). 회귀 테스트 `shipdb-canonical-loader.spec.js` 4건. 아직 어떤 소비처도 canonical 미참조(UI 불변). 캐시 20260718-04.
- **③RSI 카탈로그 탭 UI 완료(PM 순서 2)**: `js/shipdb-rsi-catalog.js` — ON에서만 별도 칩(레거시 미수정 형제 컨테이너)+전용 그리드. 카드=RSI 명칭·상태 배지(concept "컨셉·RSI 공식 사양·변경 가능"/flight-ready "출시·RSI 공식 사양")·제조사·역할·크기·승무원·화물·KO 설명(expanse="RSI 공식 설명 미제공")·출처 링크·확인일. 게임플레이 값 미표시. DOM API(innerHTML 미사용), 언어 대응. 회귀 `shipdb-rsi-catalog.spec.js` 5건. 캐시 05.
- **④카탈로그 실전 제외 가드 완료(PM 순서 3)**: canonical∩rsi-official=∅(구조적 보장 — 플래너·비교·AI 사실원 canonical에 카탈로그 id 0) + 카탈로그 카드에 비교/플래너/행어 컨트롤 없음(진입점 차단). 계약 10 + 카탈로그 스펙 6.
- **⑤priceUsd 첫 원자 이관 완료(PM 순서 4)**: 플래그 gate 6지점 — ships.js(카드 스탯·비교 컬럼·모달 스탯) + main.js(정렬 비교자·검색 색인) + 정렬 드롭다운 price 옵션 제거. OFF=priceUsd 그대로(기준선, 시각 회귀 통과), ON=공개 모델서 제거(D4). 회귀 `shipdb-price-migration.spec.js` 2건. admin CMS priceUsd 편집·DDL은 3.5 제거 대상(공개 표시와 분리).
- **⑥비교 하네스 + ON 메인 219 정합 완료(PM C)**: ON에서 메인 ShipDB 리스트를 canonical 219로 좁힘(컨셉 30→카탈로그 탭 전용, 별칭 7→리다이렉트) — 로더 `publicShipIds()` + getVisibleShips ON 필터 + canonical 로드 후 재렌더(marketOnly 패턴). 비교 하네스 `shipdb-compare-harness.spec.js` 3건: OFF 메인 256·priceUsd·무카탈로그 / ON 메인 219(=canonical 정확일치)·카탈로그 30·priceUsd 제거 / 허용 차이만(OFF∖ON=컨셉30+별칭7, ON 신규 추가 0). 이후 필드 이관의 안전장치.
- **⑦crew 원자 이관 완료(PM 지정)**: ON이면 Erkul `live.crewSize`를 공개 기준값으로(로더 `getShip(id)` + ships.js crewDisplay/crewMin/crewMax: 비교표·리더보드 + main.js crewSortValue: 정렬). live 있는 함선은 모달이 이미 crewSize라 무변경, 레거시 수기 crew 노출 지점(비교·리더보드·정렬)만 이관. OFF=레거시 수기(freelancer 1명). 회귀 `shipdb-crew-migration.spec.js` 2건 + 비교 하네스 통과.
- **⑧cargo 원자 이관 완료(PM 지정)**: ON이면 Erkul `live.cargoScu`를 화물 기준값으로 — ships.js cargoDisplay/cargoValueNum(카드·비교·리더보드·모달) + main.js shipCargoValue(정렬·cargoMin 필터·**플래너 하드게이트 cargo>0**·플래너 시드·추천). 값은 219척 전부 레거시 일치(불일치 0)라 표시·동작 불변, 출처만 canonical. 포맷 toLocaleString으로 콤마 유지("1,326 SCU"). 회귀 `shipdb-cargo-migration.spec.js` 2건 + 하네스 통과.
- **⑨focus·tags 제거 완료(PM 지정, 마지막 필드, D7)**: ON에서 카드 focus 배지·태그 칩·태그 필터(숨김)·비교 focus 행·태그 노트·검색 색인(focus/focus_en/tags_en) 제거, 대체 분류 없음. '미구현' 릴리스 게이트는 `implemented!==false`로 자연 대체(unreleased 31=implemented false 정합, isPlannerEligibleShip에 이미 포함). role은 유지(PM 순서에 미포함). 회귀 `shipdb-focus-tags-migration.spec.js` 3건 + 하네스.
- **필드 이관 전부 완료(2단계 소비처 이관)**: priceUsd·crew·cargo·focus·tags. 각 `canonicalOn()` gate + OFF=기준선(시각회귀) + ON 동작 + 비교 하네스 통과. **남은 것은 3단계**: 3.1 전후 응답 비교(0.2 기준선 vs ON) → 3.2 KO 완전성 → 3.3 sync 동결 → **3.4 PM 승인 → 3.5 실전 플래그 ON + 레거시 데이터/파이프라인(재생성 4스크립트·볼트데이터 사실필드) 삭제**. 삭제·실전 전환은 3.5 승인 전까지 금지 유지.
- **소유 선언**: 데이터·백엔드(`data/canonical/`, `scripts/shipdb-rewrite/`, `tests/functions/`, 2단계부터 `js/`·`functions/`·`admin/`).

## 완료 — J-2 랜딩 초점·첫 화면 정비 (2026-07-18)

- **PM 대체 결정**: J-1의 다중 장면 시네마틱 배경을 단일 물류 장면으로 축소했다. 랜딩 구조와 중앙 히어로 소유권은 유지한다.
- **수정 범위**: `index.html`, `css/styles.css`, `js/landing.js`, `assets/images/landing/`, 랜딩·시각 회귀 테스트.
- **검증 기준**: 대표 이미지 1장만 렌더·반응형 원본 선택·지속 애니메이션 없음, 1280px/390px 첫 화면의 CTA와 hero-proof 노출, 시각 회귀에서 실제 이미지를 포함.

## 협업 기준 (세션 공통 — M0에서 확정)

- **랜딩 소유**: 현행 중앙 히어로("MOVE THE VERSE." + hero-proof)가 확정안이다.
  랜딩 구조 변경은 이 문서에 선언한 뒤 진행한다 — 두 세션이 같은 화면을 다른 방향으로 밀지 않는다.
- **시각 회귀 기준(단일 환경)**: 권위 있는 기준 이미지는 **GitHub Actions(ubuntu, `-linux.png`)**다.
  갱신은 `visual-baseline` 워크플로(수동 dispatch)로만 한다 — "승인된 변경일 때만 갱신" 원칙.
  로컬 win32 기준은 개발 편의용 참고본이며, 세션 간 서브픽셀 차이로 어긋나도 회귀로 취급하지 않는다.
- **반응형 기준점**: 새 반응형 작업은 **480 / 768 / 1200**을 우선 사용한다.
  기존 원오프 breakpoint(600/640/680/860/900/1040/1100)는 해당 컴포넌트를 수정할 때만 정리한다.

## 작업 영역 소유권 (I-1.1부터 강제)

같은 경로를 병행 세션이 반대 방향으로 수정하는 충돌을 막기 위해, 작업 시작 전에
이 문서에 **기준 SHA·수정 경로·담당 영역·해제 조건**을 선언한다. 선언된 경로는
다른 세션이 직접 수정하거나 main에 푸시하지 않고, 원 담당자의 명시적 인계 또는
PM의 대체 결정을 기다린다.

| 담당 영역 | 기본 소유 경로 | 공용/예외 |
|---|---|---|
| 디자인 | `css/`, `assets/fonts/`, `scripts/font/`, 히어로 조각, `tests/smoke/font.spec.js`, 랜딩 시각 기준 | `index.html`의 히어로 밖 영역은 공용 |
| 데이터·백엔드 | `functions/`, `migrations/`, `data/`, `scripts/erkul/`, 데이터 계약 테스트 | UI 표면을 바꾸면 디자인 담당에 인계 |
| 공용 통합 | `WORK_STATUS.md`, `sw.js`, CI 워크플로, `package.json`, 공통 진입점·스냅샷 | 두 담당자가 범위와 검증을 함께 기록 |

- **시작 선언**: `진행 중` 항목에 기준 SHA, 대상 파일·경로, 담당 영역, 예상 검증을 쓴다.
- **충돌 금지**: 선언 경로와 겹치는 작업은 새 브랜치·직접 main 푸시를 포함해 중단하고 인계를 요청한다.
- **대체 결정**: PM이 기존 결정을 대체하면, 이전 커밋·대체 커밋·회귀 검증을 한 항목에 함께 남긴다.
- **푸시 전 확인**: `origin/main`과의 변경 경로가 다른 진행 선언과 겹치지 않는지 확인한 뒤에만 main에 푸시한다.

### 현재 경로 잠금

| 담당 영역 | 기준 SHA | 수정 경로 | 해제 조건 |
|---|---|---|---|
| 데이터·백엔드 (ShipDB 재작성 1단계) | 832e2ff | `data/canonical/`·`data/shipdb-rewrite/`·`scripts/shipdb-rewrite/`·`tests/functions/shipdb-canonical-contract`·`docs/shipdb-*rewrite*` | 2단계 소비처 이관 착수 시 `js/`·`functions/`·`admin/` 추가 선언 |

- **0·1단계 범위**: 기준선·CI 차단·재grep·ID 매핑·병렬 3계층 생성. **라이브 출력 무변경**(main 내 미활성 병렬 파일). 초기화·삭제 없음. 2단계(소비처 이관)부터 라이브 경로 수정.

## 이번 반영으로 완료 (J-1 시네마틱 히어로 배경, 2026-07-18)

- **랜딩 소유 기준 관련 선언**: 히어로 **구조**(중앙 "MOVE THE VERSE." + hero-proof)는 확정안
  그대로 유지, **배경 레이어만** 스타필드 캔버스 → 함대 이미지 시네마틱으로 대체했다 — PM 직접
  지시(A안 채택: 풀블리드 이미지 + 켄 번즈). 스타필드/스타맵(D-②·F)의 캔버스·JS·성능 테스트는
  대체 완료로 제거.
- **소재**: PM이 지정한 RSI 공식 Hercules Starlifter 렌더 5장(starcitizen.tools 미러에서 원본
  확보, 2장은 7680×4320) → chromium 캔버스 인코더(`scratchpad` 1회성 스크립트)로
  `assets/images/landing/hero-01~05(.webp/-m.webp)` 생성. 데스크톱 1920w 합계 ~509KB /
  모바일 960w 합계 ~166KB. © Cloud Imperium Games — 푸터에 KO/EN 팬 콘텐츠 면책 문구 추가
  (`footer.fanDisclaimer`).
- **동작 계약(H-1 정신 유지)**: 첫 장만 `<link rel=preload>`(뷰포트별 media 분기), 나머지 4장은
  유휴 시점(requestIdleCallback) 지연 생성. 크로스페이드 9초 주기, 켄 번즈 22초(.kb)는
  fine pointer + 모션 허용에서만. reduced-motion=첫 장 정적 1장, 백그라운드 탭·홈 비활성
  (offsetParent null)에서는 전환 스킵. 가독 스크림(radial+linear)은 `.hero-cine::after`.
- **테스트**: landing-performance.spec을 스타필드 draw 카운트 → 시네마틱 계약 3건(마우스=kb+
  computed opacity 1, 터치=kb 없음+-m.webp, reduced-motion=1장 정적)으로 교체.
  visual-regression 프리즈 CSS 대상 `.hero-starfield`→`.hero-cine`.
- 캐시 버전 `20260718-02`. linux 시각 기준은 push 후 visual-baseline dispatch.

## 이번 반영으로 완료 (I-2 Liquid Glass 제거 + 추천무역품 버튼 정렬, 2026-07-18)

- **PM 대체 결정 — Liquid Glass 표면 처리 전면 제거**: 라이브 적용 후 PM이 직접 확인한 결과
  "함대 이미지와 어울리지 않고 깔끔하지 않다"고 판정, I-1~I-1.6의 글래스 표면 레이어를 제거했다.
  - 이전 결정: I-1(`cb26912`) 도입 → I-1.4(`f8dbc17`) 커버리지 확장 → I-1.5(`5079f18`) 스펙큘러
    하이라이트 → I-1.6(`d501f9a`) 톤 재조정.
  - 대체 내용: `--glass-*` 토큰 6종, 표면 오버라이드 섹션(카드 글래스 톤·버튼 필·블러 크롬
    오버라이드·sheen 규칙·성능/접근성 가드) 전체 삭제, `js/landing.js` `setupGlassSheen()` 및
    landing.spec sheen 테스트 2건 제거. 각 표면은 I-1 이전 베이스 규칙(v1.0-quality 릴리스
    기준 디자인)으로 복원된다 — nav/모달/모바일 메뉴의 기존 고정 블러는 I-1 이전부터 있던
    승인 디자인이라 유지.
  - **유지한 것**: 콘센트릭 라운딩 토큰(`--radius-sm/md/full`)과 I-1.7~I-1.8의 radius 드리프트
    수정 — 글래스와 무관한 위생 개선이라 판정.
- **추천무역품 "이 상품 선택" 버튼 크기 불일치 수정**: `.uex-recommend-card`가 `display:grid`라
  부모 그리드가 카드 높이를 균등화할 때 `align-content:stretch`가 남는 공간을 각 행(버튼 포함)에
  분배해 내용이 적은 카드일수록 버튼이 커졌다. flex column + 버튼 `margin-top:auto`(하단 고정)로
  전환 — 버튼 크기 균일화 + 하단 정렬.
- 캐시 버전 `20260718-01`. linux 시각 기준은 push 후 `visual-baseline` 워크플로 dispatch로 갱신.

## 이번 반영으로 완료 (I-1 디자인, 2026-07-15)

- **폰트 격리 결정 대체**: 이전 반영의 "미완성 폰트 격리"는 v3(신규 Node 생성기)로 대체됐다 — PM 직접 지시(I-1). 클리핑 우려는 landing.spec h1 overflow 계약으로 흡수.
- **Orbit Display v3**: Python beam 생성기 → Node 전용 생성기(외부 의존성 0, TTF+WOFF2 직접 인코딩)로
  교체. 라운드 캡 스트로크·진원 보울(오버슈트) 기반 애플 계열 지오메트리, 글리프 36→48
  (숫자·기호 확장). 적용 범위를 "지표 전용" → 브랜드 표면 전반(h1·로고·태그라인·eyebrow·배지)으로
  확대 — font.spec 계약 갱신. 한글은 여전히 시스템 폴백.
- **Liquid Glass UI (I-1)**: 표면 오버라이드 레이어로 재해석 — 구조(HTML) 무변경.
  블러는 고정 크롬/오버레이(nav·검색·모달·모바일 메뉴·토스트·lang·AI 패널)에만, 카드류는
  무블러 글래스 톤(레이어드 배경+스펙큘러 인셋). 콘센트릭 라운딩(radius 14/22/30),
  모바일 블러 축소(≤860px 14px), `prefers-reduced-transparency` 솔리드 폴백.
  랜딩 구조는 소유 기준 그대로 유지 — 표면 재질만 변경했음을 선언한다.

## 이번 반영으로 완료 (I-1.1 범위·운영 보수, 2026-07-16)

- **Orbit v3 범위 축소**: 전용 서체는 영문 히어로 제목·태그라인에만 적용한다. 내비 로고,
  작은 배지, 카드 eyebrow, hero-proof 지표는 제품 기본/모노 서체로 되돌려 작은 크기의 가독성을 보존한다.
- **비로그인 RSVP 조용한 처리**: 로그인 전에는 보호된 RSVP 집계 API를 요청하지 않는다. 세션이
  만료돼 401이 반환돼도 콘솔 경고를 만들지 않고 기존 로그인 안내를 유지한다.
- **작업 소유권 규약**: 위의 경로 단위 잠금·인계·PM 대체 기록 규칙을 협업 기준으로 추가했다.

## 이번 반영으로 완료 (I-1.2 폰트 전수 정규화, 2026-07-16)

- **Orbit 정합성**: 단일 정적 SemiBold(600) 메타데이터·CSS·히어로 렌더 굵기를 일치시키고 합성 굵기를
  차단했다. 실제 포함 글리프와 `unicode-range`도 같은 범위로 고정했다.
- **생성 경로 단일화**: Node 생성기만 남기고 `font:build`/`font:check`를 추가했다. 기본 `check`가
  TTF/WOFF2 구조, 이름·굵기 메타데이터, 히어로 문구 글리프를 매회 검사한다.
- **전역 폴백 정리**: 메인, CMS, 404가 공통 한글 시스템 스택과 공통 모노 폴백을 사용한다.

## 이번 반영으로 완료 (I-1.3 원래 제품 서체 복원, 2026-07-16)

- **Orbit 전면 제거**: 사용자 확인에 따라 전용 VOLT Orbit 웹폰트의 적용·파일·프리로드·서비스워커 캐시·
  생성/검증 도구를 모두 제거했다. 히어로는 I-1 이전의 제품 기본 서체(제목 900)와 모노 태그라인을 사용한다.
- **회귀 계약 전환**: 스모크 테스트는 Orbit 로드가 아니라 전용 폰트가 히어로에 남지 않고, 기본 서체에서
  클리핑 없이 렌더되는지를 검증한다.

## 이번 반영으로 완료 (I-1.8 border-radius 하드코딩 전수 감사·토큰화, 2026-07-16)

- **배경**: I-1.7에서 히어로 버튼 `2px` 하드코딩을 발견한 뒤 "같은 유형의 드리프트가 더 있는지"
  질문을 받아 `border-radius`가 `var(--radius-*)` 토큰을 쓰지 않는 전체 선언(~90건)을 grep으로
  추출해 개별 검토했다.
- **분류 기준**: 원(`50%`), `inherit`, 비대칭 복합값, 아바타/썸네일/채팅 말풍선/엣지케이스 페이지처럼
  크기에 비례한 의도적 변형은 버그가 아니라고 판단해 제외(`.leader-avatar` 18px, 갤러리/스트리머
  썸네일 18px, `.volt-ai-message-bubble` 18px, CEO 아바타 16px, `.noscript-fallback section` 24px,
  `.icon-link::before/::after` 2px 등).
- **정확 일치 토큰화(시각 변화 없음, 12건)**: `border-radius: 14px` → `var(--radius-sm)`,
  `22px` → `var(--radius-md)`, `999px` → `var(--radius-full)` — `.mobile-menu a`·
  `.uex-candidate-card`·`.partner-fleet-card`·`.partner-fleet-logo`·리더 아바타 서브셀렉터·
  `.volt-ai-input`·필 버튼/배지류 등.
- **오버라이드 드리프트 버그 4건 발견·수정**: I-1.4에서 무블러 글래스 카드 계열로 문서화됐지만
  실제로는 형제 셀렉터(`--radius-md`, 22px)와 다른 값을 쓰고 있던 것들.
  - `#leadership .leader-card`(18px) — 베이스 `.leader-card`는 이미 `var(--radius-md)`인데 ID
    스코프 규칙이 더 높은 specificity로 구형 값을 덮어쓰고 있었다.
  - `.ship-advanced-panel`(18px), `.mypage-card`(20px) — 둘 다 카드 계열 문서상 22px 기준인데 미조율.
  - `.cargo-filter-btn`(20px→`var(--radius-full)`) — `.notice-filter-btn`/`.ship-filter-btn`/
    `.uex-loc-btn`과 완전히 동일한 "투명 베이스 + 주황 active/hover" 패턴의 칩인데 I-1.4 글래스
    톤·스펙큘러 하이라이트 확장 때 함께 추가되지 못하고 누락돼 있었다 — 이번에 글래스 톤 그룹
    (`background-image: var(--glass-bg)`)과 스펙큘러 셀렉터(`SHEEN_SELECTOR`, `.is-sheening` CSS
    규칙) 양쪽 모두에 형제 칩과 동일하게 추가해 완전히 통일했다.
  - 반대로 `.uex-candidate-card`/`.partner-fleet-card`(14px, `--radius-sm`)는 `.ship-card`(22px)보다
    작고 밀집된 그리드 타일이라 더 작은 반경 티어를 쓰는 것이 콘센트릭 언어상 의도적 비례로 판단해
    값 자체는 바꾸지 않고 토큰만 입혔다.
- **검증**: check ✅ (문법/링크/마이그레이션/innerHTML 베이스라인/biome lint 전부 통과).
- **캐시 버전**: `20260716-08`.

## 이번 반영으로 완료 (I-1.7 히어로 CTA 곡률 불일치 수정, 2026-07-16)

- **문제**: 랜딩 히어로의 "함선DB 보기"·"무역플래너"·"가입하기" 버튼이 `border-radius: 2px`(거의
  직각)로 렌더되고 있었다 — 사이트 전역 `.btn` 기본값(`var(--radius-full)`, 완전 필 형태)과
  불일치. 원인은 `.hero-copy .btn`(0,2,0 specificity)이 랜딩 리디자인 당시 "기술/HUD" 톤으로
  2px를 하드코딩해 기본 필 반경을 덮어쓰고 있었기 때문 — Liquid Glass(I-1) 도입 이전부터 있던
  값이라 콘센트릭 라운딩 체계와 한 번도 조율된 적이 없었다.
- **동일 패턴 5건 추가 발견·수정**: `.landing-cta .btn`(랜딩 카드 내부 CTA), `.pwa-install-prompt
  .btn`(모바일 미디어쿼리) — 버튼류는 전부 override 제거해 기본 필 반경으로 복귀.
  `.landing-grid`·`.landing-briefing`(3열 하이라이트/브리핑 패널 외곽 프레임)은 `--radius-md`(22px)로
  올려 카드/모달과 동일한 콘센트릭 언어에 맞췄다. `.pwa-install-prompt` 모바일 컨테이너는 데스크톱
  기준값(20px)에 맞춰 통일.
- **검증**: 컴퓨티드 스타일로 히어로 버튼 3개 전부 `980px`(필) 확인. `.landing-grid`/
  `.landing-briefing`은 `overflow:hidden` + 내부 그리드 라인이 있어 스크린샷으로 클리핑 아티팩트
  없음을 확인(외곽 모서리만 둥글고 내부 컬럼 경계는 그대로 직선). check ✅ · functions 120/120 ✅ ·
  playwright 245/246 — `visual-regression` 홈 데스크톱 1건은 버튼 모양이 실제로 바뀐 의도된
  변경이라 기존 linux 기준과 다름(498px diff). 로컬에서 기준을 직접 덮어쓰지 않고 `visual-baseline`
  워크플로(수동 dispatch)로 정식 갱신 예정 — WORK_STATUS 승인된 변경만 갱신 원칙 준수.

## 이번 반영으로 완료 (I-1.6 유리 톤 재조정 — 베벨 제거·투명도 상향, 2026-07-16)

- **피드백**: "구형 Windows 느낌, 애플 리퀴드 글래스와 거리가 있다" — 진단 결과 두 가지 원인.
  ① `--glass-inset`이 위(밝은선)+아래(어두운선) 이중 인셋으로 "볼록한 유광 버튼" 베벨을 만들었음
  (Windows Aero의 시그니처 스타일). ② 블러 크롬 표면(nav/모달/토스트 등)의 배경 알파가 과해
  (최대 0.72) 뒤 콘텐츠가 거의 안 비쳐 "반투명 패널"이 아니라 "불투명 다이얼로그"로 읽혔음.
- **베벨 제거**: `--glass-inset`을 이중 인셋에서 상단 하이라이트 1개(`inset 0 1px 0 rgba(255,255,255,.075)`)로
  단순화 — 전 사용처(카드류·모달·토스트·AI 패널)에 토큰 하나로 일괄 반영.
- **투명도 상향**: `--glass-bg-deep` 0.58→0.38, `.nav` 0.55→0.36(스크롤 시 0.72→0.52), `.toast`/
  `.pwa-install-prompt` 0.72→0.44, `.volt-ai-chat-panel` 0.42→0.34 — 가독성 보완으로 블러
  22px→28px, 새추레이션 160~170%→170~180%로 상향.
- **하드 드롭섀도 → 앰비언트 글로우**: 카드 hover 그림자를 `0 18px 44px rgba(0,0,0,.38)`(아래로
  떨어지는 방향성 그림자)에서 얇은 외곽선(`0 0 0 1px`) + 더 부드러운 확산 그림자 조합으로 교체 —
  "그림자를 드리우는 불투명 패널"보다 "은은하게 빛나는 유리" 느낌에 가깝게.
- **구조적 한계(투명하게 기록)**: `.ship-card` 등 카드류는 I-1에서 성능상 무블러로 설계됐다
  (240개 이상 렌더 시 backdrop-filter 비용 회피). 다크 위주 브랜드 팔레트(카드 배경 자체가
  거의 검정)에서는 블러 없는 표면의 "비침" 자체가 물리적으로 제한적 — 실제 개선은 블러가 걸린
  nav/모달/토스트/드롭다운/AI 패널에서 뚜렷이 보이고(밝은 히어로 배경 위 nav로 확인),
  카드류는 베벨 제거·그림자 완화가 주된 개선 축이다.
- **검증**: check ✅ · functions 120/120 ✅ · Playwright 246/246(전부 유지, 회귀 없음).

## 이번 반영으로 완료 (I-1.5 리퀴드 스펙큘러 하이라이트, 2026-07-16)

- **포인터 추종 반사광**: I-1.4가 커버한 필터 칩 3종·입력 7종에 `js/landing.js`
  `setupGlassSheen()`(신규)으로 포인터 위치 기반 `radial-gradient` 스펙큘러 하이라이트 추가.
  `--sheen-x`/`--sheen-y` CSS 커스텀 프로퍼티를 `pointermove`로 갱신하고 `.is-sheening` 클래스로
  토글 — `background-image` 2번째 레이어로 `--glass-bg` 위에 얹는다.
  기존 `setupTilt`/`setupMagnetic`과 동일한 `fineMotionOk()` 게이트(coarse pointer·
  reduced-motion 완전 비활성) 재사용.
- **위임(delegation) 방식**: notices.js/ships.js/uex-panel.js가 언어 전환·데이터 갱신 때마다 다시
  렌더하는 요소이므로, 개별 리스너 대신 `document`에 단일 `pointermove` 리스너를 걸고
  `closest()`로 매칭 — 재렌더된 요소도 별도 재바인딩 없이 자동 커버.
  칩/active 상태는 `background` shorthand가 우선해 하이라이트가 자동으로 가려짐(추가 처리 불필요).
- **검증**: `tests/smoke/landing.spec.js`에 2건 추가(fine pointer hover 시 `--sheen-x` 갱신·이탈 시
  해제, coarse pointer에서 `.is-sheening` 전무 확인). check ✅ · functions 120/120 ✅ ·
  Playwright 246/246. 스크린샷 크롭으로 육안 확인(칩·입력 모두 커서 위치 따라 하이라이트 이동).

## 이번 반영으로 완료 (I-1.4 Liquid Glass 표면 커버리지 확장, 2026-07-16)

- **카드/패널 25종 추가**: I-1이 커버한 11개 카드류(landing/notice/schedule/guide/hub/join-checklist/
  leader/gallery/ship/volt-ai-source/faq)에 `.card`·`.culture-item`·`.streamer-card`·
  `.ship-compare-bar`·`.ship-advanced-panel`·`.uex-live-panel`·`.uex-candidate-card`·
  `.uex-recommend-card`·`.guide-tool-card`·`.partner-fleet-card`·`.mypage-card`·`.comms-card`·
  `.ledger-mobile-card`·`.static-guide-card`를 무블러 글래스 톤(기존 `--glass-bg`/`--glass-inset`
  토큰 재사용)으로 확장 — 새 토큰 추가 없이 기존 레이어링 기법(개별 selector의 `background`
  위에 후속 규칙으로 `background-image` 얹기) 그대로 적용해 회귀 위험을 최소화했다.
- **필터 칩·입력 필드**: `.notice-filter-btn`·`.ship-filter-btn`·`.uex-loc-btn`(비활성 상태만 —
  active/hover는 기존 실색 강조 유지, specificity로 자동 보존)과 `.ship-search`·
  `.global-search-input`·`.trade-planner-form input/select`·`.planner-picker input`·
  `.volt-ai-input`·`.ledger-qty-field input`에 동일 글래스 톤 적용 — 카드와 입력 표면이
  시각적으로 통일됨.
- **오버레이 2종 승격**: `.nav-more-menu`/`.nav-trade-menu`(드롭다운)·`.pwa-install-prompt`(플로팅
  설치 안내)를 무블러 톤에서 기존 블러 크롬 그룹(`.search-panel`/`.modal-card`류, `.toast`류)으로
  이동 — 모바일 블러 축소 미디어쿼리·`prefers-reduced-transparency` 폴백 목록에도 동반 추가.
- **검증**: check ✅ · functions 120/120 ✅ · Playwright 244/244(시각회귀 포함, linux 기준 스냅샷 대비
  `maxDiffPixels` 임계 이내 — 카드 표면 변화가 미묘해 골든 계약을 깨지 않음). 화면별 스크린샷
  수동 검토(홈/함선DB/공지/일정/무역플래너/임원진)로 과도함 없이 자연스러운 확장인지 확인.

## 이전 반영으로 완료 (M1 + M1.1, 2026-07-15)

- **M1.1 정확성 보수 (활성화 전 필수)**: ① 답변을 서버 확정(도구 템플릿)으로 고정하고 모델 문장은
  `aiNote` 보조 설명으로 분리 — 도구 데이터에 없는 수치가 들어오면 서버가 폐기. ② UEX 시세는
  date_modified 60분 이내 행만 안내(전부 오래되면 stale 명시, 가격 미생성). ③ "다가오는 일정"은
  오늘 이후를 가까운 순으로(날짜 없는 항목은 후순위). ④ 비용 상한 표현을 "예산 보호 장치(근사)"로
  정정, 일일 초기화 = UTC 자정(KST 09:00) 명시.
- **VOLT AI MVP (도구 기반)**: `/api/ai/chat` 단일 관문 — Discord 멤버 전용, 분당 8회·일일 200회·
  일 ₩3,000/월 ₩30,000 예산 보호 장치(근사 집계), 대화 원문 미저장(사용량·도구 종류만 익명 집계).
  결정론 도구 4종(함선 추천/비교 — ShipDB Erkul 레이어, UEX 시세 — 자체 프록시, 일정·공지 — D1),
  Workers AI 어댑터(`_shared/ai-model.js`, 교체 가능), 모델 무존재 시 템플릿 폴백.
  모든 수치 응답에 출처 카드+기준 시각. UEX 불가 시 추천 미생성·불가 명시.
  Functions 13건·스모크 5건 추가. **활성화는 운영자 작업**(런북 7-2절: AI 바인딩 + `VOLT_AI_ENABLED=true`).

## 이전 반영으로 완료 (M0, 2026-07-14)

- 홈 시각 스냅샷 실패 해소(폰트 계량 범위 변경분 기준 갱신 — PM #6 승인 대기 표기).
- 시각 회귀 CI 단일화: linux 기준 생성 워크플로 + CI skip 해제 + 실패 시 diff/trace 아티팩트.
- README 문서 색인 G/H 완료 정정, `waitForTimeout` 심사·교체, CSS 중복 146건 분류(아래 백로그).

## 이전 반영으로 완료 (2026-07-13)

- 마일스톤 H-1~H-5: 터치 스타필드 비용 절감, 320px·가로모드 회귀망, 정적 콘텐츠 모듈화,
  미사용 PNG 제거, 폰트 스택 정리.
- 마일스톤 G-1~G-5: 섹션별 제목, SearchAction 실제 동작, FAQ JSON-LD 검증, 공유 메타,
  `/guide/` 정적 가이드와 sitemap.
- 백로그 재검증: 함선 EN 데이터와 RSVP 표시 i18n은 이미 구현되어 있었고, ShipDB 후보 분류는 완료 상태로 정정.

## 운영자 또는 외부 원본 대기

| 항목 | 필요한 권한 또는 입력 | 실행 방법 |
|---|---|---|
| D1 migration 0008~0011 적용 확인 | 운영 D1 접근 권한 | `SELECT id, applied_at FROM schema_migrations ORDER BY id;` |
| Admin Erkul preview 리허설 | 관리자 로그인 | CMS에서 preview 실행 → hash 확인 → 로컬 apply |
| Hammerhead 가격 anomaly | 인게임/Erkul 원본 확인 | 구·신 엔티티 중 실제 판매가 확인 후 `ship-market.js` 정리 |
| 배포 Lighthouse/RUM | 배포 환경 접근 | 운영 URL에서 성능·SEO 실측 |
| Search Console·네이버 제출 | 검색 도구 소유자 권한 | sitemap 제출 및 색인 상태 확인 |

## 의도적으로 보류

- Stage B setup 지연: 이벤트 바인딩 순서 회귀 위험이 커서, 실제 성능 계측에서 필요성이 확인될 때만 진행한다.
- CSS 콤마 그룹 중복 100건: 공용 베이스+오버라이드 구조이므로 자동 병합하지 않는다.
