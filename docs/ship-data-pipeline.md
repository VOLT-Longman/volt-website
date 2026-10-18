# 함선 데이터 소스 운영 방식

공개 ShipDB는 **254척 = Erkul canonical 224척 + RSI 공식 30척**이며, 사실값의 출처는 이 둘뿐입니다.
2026-10-18 기준 Erkul 원본은 `4.10.2-LIVE.12913470`입니다. 221척은 이 버전으로 갱신했으며,
최신 원본에 없는 Ballista Dunestalker·Ballista Snowblind·Nox Kue 3척은 이전 버전과 동기화 날짜를 보존합니다.
3.5-B에서 VOLT 수기 재생성 경로와 SC Wiki 가격 데이터는 물리 삭제했습니다.

## 계층

1. **Erkul canonical (224척)** — `data/canonical/ships-canonical.json`
   - 사실원: Erkul live 레이어(`data/ship-live-stats.js`·`data/ship-market.js`)
   - 내용: 제조사·역할·크기·플랫폼·승무원·화물·HP·시장(구매/렌탈) 등 게임 사실값
2. **RSI 공식 카탈로그 (30척)** — `data/canonical/ships-rsi-official.json`
   - 사실원: RSI 공식 Ship Matrix 스냅샷(`data/external/rsi/official-ship-matrix.json`)
   - RSI가 제공하지 않는 게임플레이 값은 추정하지 않습니다(계약 테스트로 강제).
3. **표시 계층** — `presentation-ships.json`(영문 표시명·공식 URL)·`localization-ships.json`(KO 설명)·
   `localization-roles.json`(역할 KO)·`ship-filter-taxonomy.json`(규모·플랫폼/역할 태그).
   사실을 바꾸지 않는 표기·번역·분류만 담습니다.
4. **운영 계층** — `operational-ships.json`(동기화 시각·매칭 상태), D1 `ship_overrides`(표시명·숨김 등 운영 수정값).

`data/volt-data.js`의 ships 배열은 삭제됐습니다(3.5-B 후속). 함선의 사실값·표시값 어느 쪽도 거기에 없으며,
해당 파일에는 임원진·연혁 등 비함선 섹션만 남아 있습니다.

## 동기화 방법

```bash
npm run shipdb:erkul:fetch        # Erkul live 원본 수집
npm run shipdb:erkul:apply -- --dry-run  # 현재 ID의 변경 내역·previewHash 검토
# 출력된 hash를 지정해야 적용됨. 원본/정규화/시장/입력 manifest/canonical도 함께 갱신
npm run shipdb:erkul:apply -- --confirm-preview-hash <hash>
# 새로 변경된 EN 원문은 KO 번역 파일에 sourceEnHash와 함께 반영
npm run shipdb:erkul:post-apply
npm run shipdb:erkul:verify       # 배포 데이터와 재생성 결과 대조(재현성)
```

관리자 CMS의 Erkul Preview → Safe Apply 경로도 같은 레이어를 갱신하며, `previewHash`로 적용 대상을 고정합니다.
레거시 `match-erkul-to-volt`는 삭제된 VOLT ships 배열을 전제로 하므로 현재 갱신 경로에 사용하지 않습니다.

### 식별자 변경과 신규 함선 검토

일반 Safe Apply는 신규 후보를 추가하거나 유사한 이름으로 자동 재매칭하지 않습니다.
이번 검토 기록은 `data/external/erkul/catalog-review-20261018.json`입니다.
Constellation Mk IV 4종은 기존 VOLT ID를 유지한 채 `_gs` 원본 식별자로 이관했습니다.
Gladius Dunlevy·Sabre Raven EX·S-65 Stingray·Constellation Mk V Centaurus·Skylark는 별개 ID로 추가했고,
Drake Command Module은 부속 모듈이므로 제외했습니다.

`--reconcile-catalog`를 dry-run과 적용 모두에 명시하면 검토 파일의 원본 버전·이름·ref와 기존 identity를
정확히 대조한 뒤 이 검토만 적용합니다. 원본이 검토 버전과 다르면 중단합니다. 추가 검토 없이 이 옵션을
다음 버전에 재사용하지 않습니다. 신규 함선은 표시명·KO 설명·검색어도 추가해야 합니다.
동결된 재작성 기준선은 수정하지 않으며, 공개 ID 계약은 기준선과 명시적으로 검토된 신규 ID의 합집합입니다.

## 현재 적용 원칙

- 공개 목록은 canonical 224 + RSI 30만 노출하고, 중복 에디션 7척은 별칭으로 리다이렉트합니다(목록 미등장).
- canonical에는 `priceUsd`·VOLT 수기 `focus`/`tags`/`crew` 같은 레거시 필드를 넣지 않습니다(계약 테스트가 차단).
- RSI 공식 30척은 별도 카탈로그로 유지하며, 비교·무역플래너 대상에 섞지 않습니다.
- 한국어 설명·역할 라벨은 Erkul 원문을 기준으로 번역하며, 사실을 바꾸지 않습니다.
- 삭제된 레거시 경로(`sync-rsi-ship-matrix`·`sync-ship-prices`·`normalize-ship-database`·`build-ship-database`·
  `build-ship-en`·`ship-prices-usd.json`)는 재도입하지 않습니다.
