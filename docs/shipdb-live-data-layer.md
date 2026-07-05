# ShipDB 2.0 라이브 데이터 레이어 (A-5)

`data/ship-live-stats.js` / `data/ship-market.js`는 Erkul live 원천의 상세 스펙·구매처 데이터를
기존 `data/volt-data.js`와 **분리된 레이어**로 제공한다. 재생성: `npm run shipdb:erkul:build-live`

## 왜 volt-data.js에 직접 merge하지 않는가

- `volt-data.js`는 VOLT 큐레이션(한국어 역할명/태그/설명/운영 분류) 층이다. Erkul 수치를 직접 merge하면
  원천이 섞여서 어느 값이 어디서 왔는지 추적할 수 없게 되고, Erkul 재동기화 때마다 큐레이션 필드가 훼손될 위험이 생긴다.
- 별도 레이어로 두면: 동기화 = 레이어 파일 재생성(멱등), 롤백 = 파일 revert, 원천 추적 = `source`/`syncedAt` 필드로 명확.
- UI(A-6)는 VOLT ship id로 두 레이어를 lookup해서 합쳐 보여주기만 한다.

## 구조

```js
// data/ship-live-stats.js
window.VOLT_SHIP_LIVE_STATS = {
  "<voltShipId>": {
    source: "erkul-live", sourceVersion: "live", syncedAt: "...",
    erkulLocalName: "anvl_asgard", erkulRef: "...",
    manufacturer, role, career, size /* "S4" 표기 */, crewSize,
    speeds: { scm, scmBoostForward, scmBoostBackward, navMax },
    rotation: { pitch, yaw, roll, boosted*/current*: null /* raw에 없음 — A-2 결정 */ },
    countermeasures: { decoy, noise },
    hp, cargoScu,
    dimensions: { length, beam, height, sizeRaw: { x, y, z } /* bounding-box 파생, 원본 보존 */ },
    massKg /* 원본 정밀도 유지 (610246.06) */,
    fuel: { hydrogenScu, quantumScu },
    insurance: { expeditionFee, claimTime /* 분 */, expediteTime /* 분 — HH:MM:SS 변환은 표시층 */ },
    damageReduction: { physical, energy, distortion, fuse, component /* 배율 원본, %는 표시층에서 1-값 */ },
    descriptions: { source: "erkul-live", enRaw, en /* 헤더 제거 정제본 */, ko: null }
  }
};

// data/ship-market.js
window.VOLT_SHIP_MARKET = {
  "<voltShipId>": {
    source: "erkul-live", sourceVersion: "live", syncedAt: "...",
    erkulLocalName, erkulRef,
    purchase: [{ shop, location, price /* aUEC */, available, unavailable }],
    rentals: [{ shop, location, price /* null = 가격 미표기 */, available, unavailable }],
    anomalies: []
  }
};
```

## 포함/제외 기준

| 대상 | 처리 |
|---|---|
| A-4 matched 210척 | ✅ 두 레이어 모두 포함. 시장 정보 없는 함선도 빈 배열로 포함 |
| unmatched VOLT 30척 (unreleased/컨셉) | ❌ 제외 |
| Erkul-only 9척 (VOLT DB에 없는 변형/신규) | ❌ 제외 — `new-candidates` 성격, 자동 추가 금지 |
| market-only unmatched 6종 (구형 Aurora 5 + aegs_hammerhead) | ❌ 제외 — shop/ships 원천 불일치, stats 없는 market-only 데이터가 되므로 리포트로만 유지 |
| VOLT 에디션/번들 변형 7척 (canonicalId 보유) | ❌ 제외 — 원본 함선 key로 귀결 |

제외 목록 전체는 `data/external/erkul/live-data-build-report.json`의 `excluded`에 기록된다.
빌드 스크립트는 key 수/필수 필드/제외 대상 미포함을 자체 검증하며 실패 시 파일을 쓰지 않고 종료한다.

## 설명문 정책 (A-5 시점)

- `descriptions.enRaw` = Erkul 원문(`Manufacturer:/Focus:` 헤더 포함), `en` = 헤더 제거 정제본, `ko` = `null`.
- 기존 `volt-data.js`의 한국어 설명과 `ship-en.js`는 **변경하지 않는다**.
- 실제 설명 교체(A-6/A-7) 시 기존 설명을 `legacyKo`/`legacyEn`으로 백업한 뒤 진행한다.
- 한국어 자동 번역은 별도 정책 승인 전까지 금지.

## A-6 UI 연결 방법 (예정)

1. `index.html`에 `<script src="data/ship-live-stats.js">`, `<script src="data/ship-market.js">` 추가
   (캐시 버전 쿼리는 `scripts/update-cache-version.js` 규칙을 따름).
2. 함선 모달에서 `window.VOLT_SHIP_LIVE_STATS[ship.id]` / `window.VOLT_SHIP_MARKET[ship.id]` lookup.
3. 값이 없으면(미매칭 37척 등) 기존 volt-data 표시로 폴백. 렌탈 `price: null`은 "가격 미표기"로 표시.
4. dimensions는 Erkul bounding-box 파생값이므로 표기 시 출처 라벨(`erkul-bounds-derived`) 권장.

## A-7 Admin sync (예정)

Admin CMS의 Erkul sync는 이 레이어 파일들을 재생성하는 파이프라인
(fetch → normalize → market → match → build-live)을 실행하고 preview/승인 후 반영하는 형태로 구현한다.
이 레이어가 sync의 갱신 단위다.
