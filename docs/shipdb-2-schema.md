# ShipDB 2.0 상세 스펙 스키마 (A-1)

> **시점 기록 (2026-07-25 확인).** 이 문서는 작성 당시 상태를 남긴 기록이며 현행 운영 문서가 아니다.
> 본문이 현재형으로 서술하는 `data/volt-data.js`의 ships 배열, `data/ship-en.js`,
> `data/ship-prices-usd.json`, 레거시 재생성 스크립트는 **3.5-B에서 물리 삭제**됐다.
> 현재 데이터 구조는 [ship-data-pipeline.md](ship-data-pipeline.md), 운영 절차는
> [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md)를 사실원으로 본다.

ShipDB 2.0에서 함선 상세 스펙/구매처/설명문을 담을 목표 데이터 구조와 원천 정책을 정의한다.
이 문서는 **스키마 확정 단계**의 산출물이며, 실제 데이터 반영(A-2 이후) 전까지 `data/volt-data.js`는 변경하지 않는다.

## 원천 정책 (핵심 원칙)

| 층 | 역할 |
|---|---|
| **Erkul** (`server.erkul.games/live/*`) | live 수치/스펙/마켓(구매처·가격) 원천 |
| **Erkul / 공식 원천** | KO/EN 설명문 교체 후보 원천 |
| **VOLT** | 표시(presentation)/검색/커뮤니티 UX 층 |

- 기존 VOLT 큐레이션 설명문은 장기적으로 교체 대상이다. 단, **교체 전 legacy 백업이 필수**다
  (`descriptions.legacyKo` / `descriptions.legacyEn`에 보존 후 교체).
- 수치는 Erkul live를 기준으로 하며, 추정값을 실제값처럼 기록하지 않는다. 값이 없으면 `null` 유지.
- 기존 파이프라인(RSI Ship Matrix, [ship-data-pipeline.md](ship-data-pipeline.md))은 병행 유지하며,
  Erkul 층은 `externalStats`라는 별도 네임스페이스로 격리한다.

## 목표 데이터 구조

### `ship.externalStats` — Erkul live 수치 층

```js
ship.externalStats = {
  source: "erkul-live",
  sourceVersion: "live",
  syncedAt: null,

  manufacturer: null,        // manufacturerData.data.name
  role: null,                // vehicle.role
  career: null,              // vehicle.career
  size: null,                // size (숫자 4 → 표기 "S4"는 표시층 변환)
  crewSize: null,            // vehicle.crewSize

  speeds: {
    scm: null,               // ifcs.scmSpeed
    scmBoostForward: null,   // ifcs.boostSpeedForward
    scmBoostBackward: null,  // ifcs.boostSpeedBackward
    navMax: null             // ifcs.maxSpeed
  },

  rotation: {
    pitch: null,             // ifcs.angularVelocity.x
    yaw: null,               // ifcs.angularVelocity.z
    roll: null,              // ifcs.angularVelocity.y
    // boosted/current 6종: raw에 없는 Erkul 클라이언트 계산값 (A-2 결정: 계산식 역추적 전까지 null 유지.
    // 계산식이 확인되면 externalStats가 아닌 별도 derivedStats로 추가한다. 첫 반영에서 계산식 생성 금지)
    boostedPitch: null,
    boostedYaw: null,
    boostedRoll: null,
    currentPitch: null,
    currentYaw: null,
    currentRoll: null
  },

  countermeasures: {
    decoy: null,             // items.countermeasures[shortName='Decoy'] ammo 합산
    noise: null              // items.countermeasures[shortName='Noise'] ammo 합산
  },

  hp: null,                  // hull.totalHp
  cargoScu: null,            // cargo

  dimensions: {
    length: null,            // max(vehicle.size.x, .y) — A-2 검증: 고정축 해석 불가(함선마다 다름)
    beam: null,              // min(vehicle.size.x, .y)
    height: null,            // vehicle.size.z
    sizeRaw: null            // { x, y, z } 원본 축 보존 (휴리스틱 파생을 되돌릴 수 있게)
  },

  massKg: null,              // hull.mass

  fuel: {
    hydrogenScu: null,       // fuelCapacity
    quantumScu: null         // qtFuelCapacity
  },

  insurance: {
    expeditionFee: null,     // insurance.baseExpeditingFee
    claimTime: null,         // insurance.baseWaitTimeMinutes (분 → HH:MM:SS 변환은 표시층)
    expediteTime: null       // insurance.mandatoryWaitTimeMinutes
  },

  damageReduction: {
    physical: null,          // armor.data.armor.damageMultiplier.damagePhysical (배율 원본)
    energy: null,            // armor.data.armor.damageMultiplier.damageEnergy
    distortion: null,        // armor.data.armor.damageMultiplier.damageDistortion
    fuse: null,              // vehicle.fusePenetrationDamageMultiplier
    component: null          // vehicle.componentPenetrationDamageMultiplier
  }
};
```

### `ship.descriptions` — 설명문 층 (legacy 백업 포함)

```js
ship.descriptions = {
  source: null,      // "erkul-live" | "global-ini" | "volt-curated" 등
  syncedAt: null,
  enRaw: null,       // Erkul data.description 원문 (Manufacturer:/Focus: 헤더 라인 포함, 리터럴 \n 줄바꿈)
  en: null,          // 헤더 제거 후 정제본 (A-2 결정: 원문/정제본 분리 저장)
  ko: null,          // 교체 후 한국어 설명 — 자동 번역은 별도 정책 승인 전까지 금지
  legacyKo: null,    // 교체 전 기존 VOLT 큐레이션 백업 (필수)
  legacyEn: null     // 교체 전 기존 ship-en.js 백업 (필수)
};
```

### `ship.market` — 구매처/렌탈 층

```js
ship.market = {
  source: "erkul-live",
  syncedAt: null,
  purchase: [],      // shop 응답: { name, location, price } (data.inventory[].price, aUEC)
  rentals: []        // shop 응답 내 렌탈 항목 (A-3에서 구조 확정)
};
```

## 설명문 KO/EN 원천 확인 결과 (A-1 사실)

- **EN**: Erkul `live/ships`의 `data.description`에 영어 설명이 **존재한다**.
  `Manufacturer: ...\nFocus: ...` 헤더 라인이 본문 앞에 붙어 있어 파싱 시 분리가 필요하다.
- **KO**: Erkul 페이로드 전체(17.2MB)에 한국어 문자가 **전혀 없다**. 한국어 설명은 Erkul에서 얻을 수 없다.
- KO 후보 원천: Star Citizen 클라이언트 `global.ini`(한국어 번역 커뮤니티 패치),
  기존 `data/ship-en.js` + 수동 번역, 또는 VOLT 큐레이션 유지.
  **KO/EN 전면 교체는 다음 Phase에서 진행**하며, 이번 Phase에서는 원천 가능성 확인까지만 한다.

## 데이터 파일 정책

- `data/external/erkul/ships.raw.json` (35MB), `shop.raw.json` — **커밋하지 않는다** (.gitignore).
  재현은 `npm run shipdb:erkul:fetch`로 한다. 향후 snapshot history가 필요하면
  압축 아티팩트/릴리스/별도 storage로 분리한다.
- `data/external/erkul/asgard.raw.json`, `asgard-field-sample.json`, `fetch-meta.json` — 커밋 대상.
- `data/external/erkul/ships-normalized.json` (219척, ~500KB), `coverage-report.json` — A-2 산출물, 커밋 대상.
  재현은 `npm run shipdb:erkul:normalize`.
- 필드별 실제 Erkul path와 검증 결과는 [erkul-field-map.md](erkul-field-map.md),
  필드별 채움률은 [erkul-coverage-report.md](erkul-coverage-report.md) 참조.

## 다음 단계

- ~~A-2: 전체 함선 상세 스펙 normalize~~ (완료 — dimensions 축 교차검증 포함)
- A-3: shop/purchase market normalize (rentals 구조 확정)
- A-4: VOLT 함선DB 매칭 (localName ↔ volt-data.js 함선 매핑 테이블)
