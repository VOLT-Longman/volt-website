// ShipDB Erkul 재작성 v2 — 공개 canonical 필드 계약 (0단계 0.4)
// PM 조건: 기존 재생성 스크립트가 Erkul 정규 데이터 외 필드를 다시 주입하면 CI가 실패해야 한다.
// 이 계약은 shipdb-canonical-contract.test.mjs가 강제한다. 계약을 약화하면 테스트가 함께 실패한다.

// 1단계에서 생성될 공개 canonical 데이터셋 경로. 그 전까지는 존재하지 않는다(테스트가 armed 상태).
export const CANONICAL_DATASET_PATH = 'data/canonical/ships-canonical.json';

// 공개 canonical 레코드에 절대 나타나면 안 되는 필드 (PM 9개 결정 기준).
// 재생성 스크립트가 이 중 하나라도 canonical에 주입하면 계약 테스트가 hard-fail.
export const FORBIDDEN_PUBLIC_FIELDS = [
  { field: 'priceUsd', decision: 'D4', reason: 'SC Wiki 외부 시세 — 공개 모델·동기화 파이프라인에서 제거. 신규 가격 공급자는 별도 마일스톤' },
  { field: 'focus', decision: 'D7', reason: 'VOLT 편집 분류 — 전환 1차본에서 제거, 대체 분류 없음' },
  { field: 'tags', decision: 'D7', reason: 'VOLT 편집 태그 분류 제거. "미구현" 게이트는 implemented/erkulStatus로 재매핑' },
  { field: 'crew', decision: 'D3', reason: '수기 승무원 문자열 금지 — canonical은 Erkul live.crewSize(numeric)만 사용' },
  { field: 'plannerEligible', decision: '감사', reason: 'VOLT 자체 평가 — canonical 사실값 아님' },
  { field: 'erkulName', decision: 'D5', reason: 'operational 격리 필드 — 공개 canonical 표면에 노출 금지' },
  { field: 'erkulStatus', decision: 'D5', reason: 'operational 격리 필드 — 공개 canonical 표면에 노출 금지' },
];

// 이 레거시 재생성 스크립트들은 공개 canonical 경로에 절대 기록하지 않는다.
// canonical은 1단계의 신규 생성기만 만든다. 아래 스크립트가 canonical 경로를 참조하면 재주입 위험 신호.
export const LEGACY_REGEN_SCRIPTS = [
  'scripts/normalize-ship-database.mjs',
  'scripts/sync-ship-prices.mjs',
  'scripts/build-ship-en.mjs',
];
