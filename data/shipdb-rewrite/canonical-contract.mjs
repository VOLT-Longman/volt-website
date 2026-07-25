// ShipDB Erkul 재작성 v2 — 공개 canonical 필드·선정·입력 계약 (0단계 0.4, PM 보강 반영)
// PM 조건: 기존 재생성 스크립트가 Erkul 정규 데이터 외 필드를 다시 주입하면 CI가 실패해야 한다.
// 이 계약은 shipdb-canonical-contract.test.mjs가 강제한다. 계약을 약화하면 테스트가 함께 실패한다.

// 1단계에서 생성될 공개 canonical 데이터셋 경로. 그 전까지는 존재하지 않는다(테스트가 armed 상태).
export const CANONICAL_DATASET_PATH = 'data/canonical/ships-canonical.json';
export const OFFICIAL_SPEC_OVERRIDES_PATH = 'data/canonical/official-spec-overrides.json';
export const OFFICIAL_SPEC_OVERRIDE_FIELDS = ['cargoScu'];
export const OFFICIAL_SPEC_OVERRIDE_SOURCE = 'rsi-official';

// 1단계 canonical 생성기 경로. 존재하면 아래 CANONICAL_FORBIDDEN_INPUTS를 참조하지 않아야 한다.
export const CANONICAL_GENERATOR_PATH = 'scripts/shipdb-rewrite/build-canonical.mjs';

// 0단계 기준선. canonical 선정 기준(hasLive)과 제외/별칭 집합의 권위 소스.
export const BASELINE_PATH = 'data/shipdb-rewrite-baseline.json';

// 공개 canonical 레코드에 절대 나타나면 안 되는 필드 (PM 9개 결정 기준).
export const FORBIDDEN_PUBLIC_FIELDS = [
  { field: 'priceUsd', decision: 'D4', reason: 'SC Wiki 외부 시세 — 공개 모델·동기화 파이프라인에서 제거. 신규 가격 공급자는 별도 마일스톤' },
  { field: 'focus', decision: 'D7', reason: 'VOLT 편집 분류 — 전환 1차본에서 제거, 대체 분류 없음' },
  { field: 'tags', decision: 'D7', reason: 'VOLT 편집 태그 분류 제거. "미구현" 게이트는 implemented/erkulStatus로 재매핑' },
  { field: 'crew', decision: 'D3', reason: '수기 승무원 문자열 금지 — canonical은 Erkul live.crewSize(numeric)만 사용' },
  { field: 'plannerEligible', decision: '감사', reason: 'VOLT 자체 평가 — canonical 사실값 아님' },
  { field: 'erkulName', decision: 'D5', reason: 'operational 격리 필드 — 공개 canonical 표면에 노출 금지' },
  { field: 'erkulStatus', decision: 'D5', reason: 'operational 격리 필드 — 공개 canonical 표면에 노출 금지' },
];

// 공개 canonical 선정 기준(PM 보강 2): erkulStatus === 'matched'가 아니라 **Erkul live 레코드 존재 여부**.
// 예: railen은 erkulStatus='unreleased'·implemented=false이지만 live 데이터가 존재하므로 canonical에 포함.
export const CANONICAL_SELECTION = {
  basis: 'baseline.idList[hasLive === true]',
  expectedCount: 219,
  excludedNoLiveCount: 37, // 별칭 7 + 미출시 30
  aliasCount: 7,           // canonicalId 있는 중복 에디션 — canonical 미포함, 별칭 매핑만 유지
  unreleasedNoLiveCount: 30,
  mustInclude: ['railen'], // unreleased·implemented:false지만 live 존재
};

// 3.5-B에서 물리 삭제한 레거시 재생성 경로. 다시 생기면 canonical 사실원이 흔들리므로 부재를 계약으로 강제한다.
export const DELETED_LEGACY_PATHS = [
  'scripts/normalize-ship-database.mjs',
  'scripts/build-ship-database.mjs',
  'scripts/build-ship-en.mjs',
  'scripts/sync-ship-prices.mjs',
  'scripts/sync-rsi-ship-matrix.mjs',   // focus/tags/priceUsd 파생의 상위 입력 생성기
  'scripts/shipdb-rewrite/capture-baseline.mjs', // 레거시 기준선 캡처(기준선 JSON은 동결 보관)
  'data/ship-prices-usd.json',
  'data/rsi-ship-matrix-index.json',
];

// ── RSI 공식 카탈로그 계약 (PM 2026-07-18) ──────────────────────
// Erkul live 없는 30척. 사실원=RSI 공식 Ship Matrix만. catalogStatus: concept | flight-ready.
export const RSI_OFFICIAL_DATASET_PATH = 'data/canonical/ships-rsi-official.json';
export const RSI_OFFICIAL_LOCALIZATION_PATH = 'data/canonical/localization-rsi-official.json';
export const RSI_OFFICIAL_CATALOG_STATUSES = ['concept', 'flight-ready'];
// rsi{} 허용 필드(PM step3: 역할·제조사·크기·승무원·화물·설명만). 화이트리스트 외 금지.
export const RSI_OFFICIAL_ALLOWED_FIELDS = ['manufacturer', 'role', 'size', 'crewMin', 'crewMax', 'cargo', 'descriptionEn'];
// 레코드에 절대 없어야 하는 RSI 비제공 게임플레이 값(PM step4: 추정 금지).
export const RSI_OFFICIAL_FORBIDDEN_FIELDS = ['hp', 'speed', 'speeds', 'scm', 'dps', 'purchase', 'rentals', 'price', 'priceUsd', 'market', 'cargoScu', 'crewSize'];

// canonical 생성기가 사실원으로 읽어서는 안 되는 입력(PM 보강 2).
// canonical의 사실원은 Erkul live 레이어(ship-live-stats.js·ship-market.js)뿐이다.
export const CANONICAL_FORBIDDEN_INPUTS = [
  'data/volt-data.js',            // VOLT 편집 혼재 DB
  'data/ship-prices-usd.json',    // SC Wiki 외부 시세
  'data/rsi-ship-matrix-index.json', // RSI matrix — focus/tags 파생 원천
];
