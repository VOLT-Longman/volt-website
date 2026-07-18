// ShipDB Erkul 재작성 — 서버측 canonical 전환 내부 플래그 (2.7, PM B).
// 원칙(PM): 기본 OFF. 이용자/URL로 못 켠다. 실제 ON 전환은 3.5 승인 시점에만 코드로 true.
//   클라이언트 js/shipdb-canonical.js의 서버측 대응물이다.
//   테스트는 env.SHIPDB_CANONICAL_TEST='true'로 ON 경로만 검증한다(운영 사용자 경로 아님).
//
// ON일 때 서버 reader는 canonical이 사실원인/제거된 필드를 공개 출력에서 생략한다
// — 3.5에서 D1 레거시 컬럼(price_usd·focus·tags·crew·role 등)이 삭제돼도 reader가 안전하도록.

const CANONICAL_SERVER_ENABLED = false; // 3.5 승인 시에만 true

export function canonicalServerOn(env) {
  return CANONICAL_SERVER_ENABLED === true || !!(env && env.SHIPDB_CANONICAL_TEST === 'true');
}
