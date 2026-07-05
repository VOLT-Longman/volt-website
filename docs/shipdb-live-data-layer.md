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

## UI 연결 (A-6 + lazy-load)

1. 두 레이어 파일은 초기 로드 최적화를 위해 **함선DB 첫 진입 시 지연 로드**된다
   (`js/main.js`의 `ensureShipLiveData` — `ship-en.js`와 같은 패턴, sw.js 프리캐시에는 포함).
   로드 전에 모달이 열리면 로드 완료 후 같은 함선 모달만 자동 재렌더된다.
2. 함선 모달에서 `window.VOLT_SHIP_LIVE_STATS[ship.id]` / `window.VOLT_SHIP_MARKET[ship.id]` lookup.
3. 값이 없으면(미매칭/미출시) 기존 volt-data 표시로 폴백. 렌탈 `price: null`은 "가격 미표기"로 표시.
4. dimensions는 Erkul bounding-box 파생값이므로 표기 시 출처 라벨(`erkul-bounds-derived`) 권장.

## Erkul 동기화 운영 (A-7 preview + A-8 Safe Apply)

이 레이어가 동기화의 갱신 단위다. 운영 흐름:

1. **Preview (Admin, 읽기 전용)** — Admin CMS 함선DB 탭 → [미리보기 실행].
   `GET /api/admin/ships/erkul-sync/preview`가 Erkul live를 가져와 현재 배포된 레이어와의 diff를
   보여준다. 파일/DB를 절대 쓰지 않으며, 응답에 `previewHash`(적용될 다음 레이어의 sha256)가 포함된다.
2. **Safe Apply (로컬 스크립트)** — 운영 API는 정적 파일을 쓸 수 없고 Git 이력도 남겨야 하므로,
   적용은 로컬에서 한다. Admin 패널의 [적용 명령 복사]로 명령을 복사해 실행:
   ```bash
   npm run shipdb:erkul:apply                                    # dry-run (파일 무변경)
   npm run shipdb:erkul:apply -- --confirm-preview-hash <hash>   # hash 일치 시에만 파일 재생성
   ```
   - hash가 재계산 값과 다르면(=preview 이후 Erkul 데이터 변경) exit 1로 거부된다.
   - apply는 **매칭을 새로 하지 않는다**. 현재 레이어에 존재하는 210개 voltId key만 갱신하며,
     신규 후보/market-only/미매칭은 적용에서 제외된다(신규 함선 추가는 별도 마일스톤).
   - Erkul live에서 사라진 함선은 삭제하지 않고 기존 값을 유지한다(경고 출력).
3. **KO 번역 재적용 (필수)** — apply가 entry를 재생성하므로 `descriptions.ko`가 빠진다.
   `npm run shipdb:erkul:translate-descriptions`를 반드시 실행한다 (또는 `npm run shipdb:erkul:post-apply`).
   번역 정책·stale 처리: [shipdb-description-translation.md](shipdb-description-translation.md)
4. **검증·배포** — `git diff` 확인 → `npm run check && npm test` → 커밋/푸시.
   A-6 스모크의 Asgard 대표값(HP·최저가)이 동기화로 바뀌면 기준값도 함께 갱신한다.

전체 운영 절차·체크리스트·롤백은 **[OPERATIONS_RUNBOOK.md 7-1절](OPERATIONS_RUNBOOK.md)** 이 기준 문서다.
공용 로직은 [functions/_shared/erkul-sync.js](../functions/_shared/erkul-sync.js)에 있고
preview API와 apply 스크립트가 같은 코드를 사용하므로 hash가 서로 호환된다.
