# 함선 데이터 소스 운영 방식

공개 ShipDB는 **249척 = Erkul canonical 219척 + RSI 공식 30척**이며, 사실값의 출처는 이 둘뿐입니다.
3.5-B에서 VOLT 수기 재생성 경로와 SC Wiki 가격 데이터는 물리 삭제했습니다.

## 계층

1. **Erkul canonical (219척)** — `data/canonical/ships-canonical.json`
   - 사실원: Erkul live 레이어(`data/ship-live-stats.js`·`data/ship-market.js`)
   - 내용: 제조사·역할·크기·플랫폼·승무원·화물·HP·시장(구매/렌탈) 등 게임 사실값
2. **RSI 공식 카탈로그 (30척)** — `data/canonical/ships-rsi-official.json`
   - 사실원: RSI 공식 Ship Matrix 스냅샷(`data/external/rsi/official-ship-matrix.json`)
   - RSI가 제공하지 않는 게임플레이 값은 추정하지 않습니다(계약 테스트로 강제).
3. **표시 계층** — `localization-ships.json`(KO 설명)·`localization-roles.json`(역할 KO)·
   `ship-filter-taxonomy.json`(규모·플랫폼/역할 태그). 사실을 바꾸지 않는 번역·분류만 담습니다.
4. **운영 계층** — `operational-ships.json`(동기화 시각·매칭 상태), D1 `ship_overrides`(표시명·숨김 등 운영 수정값).

`data/volt-data.js`는 표시명·설명 시드로만 남아 있고, 스펙 사실값은 canonical이 소유합니다.

## 동기화 방법

```bash
npm run shipdb:erkul:fetch        # Erkul live 원본 수집
npm run shipdb:erkul:normalize    # 정규화
npm run shipdb:erkul:market       # 시장 정규화
npm run shipdb:erkul:match        # VOLT id 매칭
npm run shipdb:erkul:build-live   # ship-live-stats.js · ship-market.js 생성
npm run shipdb:erkul:verify       # 배포 데이터와 재생성 결과 대조(재현성)
npm run shipdb:canonical:build    # canonical·localization·taxonomy·manifest 재생성
```

관리자 CMS의 Erkul Preview → Safe Apply 경로도 같은 레이어를 갱신하며, `previewHash`로 적용 대상을 고정합니다.

## 현재 적용 원칙

- 공개 목록은 canonical 219 + RSI 30만 노출하고, 중복 에디션 7척은 별칭으로 리다이렉트합니다(목록 미등장).
- canonical에는 `priceUsd`·VOLT 수기 `focus`/`tags`/`crew` 같은 레거시 필드를 넣지 않습니다(계약 테스트가 차단).
- RSI 공식 30척은 별도 카탈로그로 유지하며, 비교·무역플래너 대상에 섞지 않습니다.
- 한국어 설명·역할 라벨은 Erkul 원문을 기준으로 번역하며, 사실을 바꾸지 않습니다.
- 삭제된 레거시 경로(`sync-rsi-ship-matrix`·`sync-ship-prices`·`normalize-ship-database`·`build-ship-database`·
  `build-ship-en`·`ship-prices-usd.json`)는 재도입하지 않습니다.
