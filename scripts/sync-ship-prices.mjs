// [RETIRED · 봉인 — ShipDB Erkul 재작성 2.7]
// 근거(PM D4): priceUsd(SC Wiki 외부 시세)는 공개 모델·동기화 파이프라인에서 제거·분리됐다.
// 이 스크립트는 data/ship-prices-usd.json을 재생성해 priceUsd를 다시 파이프라인에 주입하므로 봉인한다.
// 자산(data/ship-prices-usd.json)은 삭제하지 않고 보존하되, 어떤 파이프라인도 이를 재생성/재참조하지 않는다.
// 신규 가격 공급자 도입은 별도 마일스톤(Erkul aUEC와 혼합 금지). 원본 로직은 이 커밋 이전 git 히스토리 참조.
console.error(
  '[RETIRED] scripts/sync-ship-prices.mjs 는 봉인되었습니다(ShipDB Erkul 재작성 2.7, D4). '
  + 'priceUsd는 공개 모델에서 제거됐고 재생성은 금지됩니다. '
  + 'ship-prices-usd.json 자산은 보존되지만 파이프라인에서 분리되었습니다.',
);
process.exit(1);
