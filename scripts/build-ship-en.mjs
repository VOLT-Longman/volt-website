// [RETIRED · 봉인 — ShipDB Erkul 재작성 2.7]
// 근거(PM): Erkul canonical(data/canonical) + localization(로컬라이제이션 계층)이 사실·표시원.
// 이 스크립트는 data/ship-en.js(VOLT_SHIP_EN: role·focus·size·crew·description·tags)를 재생성하며
// 제거·이관된 편집 분류(focus·tags)와 수기 role/crew의 영문 계층을 다시 만들므로 봉인한다.
// 대체: canonical role/en + localization-*.json. 원본 로직은 이 커밋 이전 git 히스토리 참조.
console.error(
  '[RETIRED] scripts/build-ship-en.mjs 는 봉인되었습니다(ShipDB Erkul 재작성 2.7). '
  + 'canonical + localization 계층이 표시원입니다. '
  + '이 스크립트가 재생성하던 ship-en(focus·tags·role·crew)은 제거·이관됐고 재생성은 금지됩니다.',
);
process.exit(1);
