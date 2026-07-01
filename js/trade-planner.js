/**
 * VOLT 무역플래너 — 다품목 수익관리 원장(ledger).
 *
 * (재설계) 단일거래 추천/브리핑 엔진을 제거하고, UEX에서 선택한 매수·매도 후보와
 * 품목별 수량(SCU)으로 무역품을 원장에 추가해 총매수·총매도·총이윤을 관리한다.
 * Phase A: 제거 완료 + 최소 스텁. Phase B: 원장 구현 예정.
 */
(function () {
    'use strict';

    function init() {}

    // uex-panel/main.js가 호출하는 인터페이스 호환용 no-op (Phase B에서 원장 로직으로 대체).
    window.VOLT_TRADE_PLANNER = {
        init,
        setup: () => {},
        renderRecommendation: () => {},
        onCargoChange: () => {},
        copyBriefing: () => {},
        shareBriefing: () => {},
        getOperationSummary: () => '',
    };
})();
