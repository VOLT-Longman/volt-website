// [RETIRED · 봉인 — ShipDB Erkul 재작성 2.7]
// 근거(PM): Erkul canonical(data/canonical)이 유일 사실원. 이 스크립트는 volt-data.js의 ships 섹션을
// rsi-ship-matrix-index·ship-prices-usd로 재생성하며 제거·이관된 필드(priceUsd·focus·tags·role/crew 등)를
// 다시 만들어 넣으므로 봉인한다(재생성은 3.5에서 제거될 레거시를 재주입).
// 대체: Erkul 파이프라인(scripts/erkul/*, npm run shipdb:erkul:*). 원본 로직은 이 커밋 이전 git 히스토리 참조.
console.error(
  '[RETIRED] scripts/normalize-ship-database.mjs 는 봉인되었습니다(ShipDB Erkul 재작성 2.7). '
  + 'Erkul 파이프라인(npm run shipdb:erkul:*)이 사실원을 만듭니다. '
  + '이 스크립트가 재생성하던 필드(priceUsd·focus·tags·role·crew)는 제거·이관됐고 재생성은 금지됩니다.',
);
process.exit(1);
