/**
 * VOLT 무역플래너 — 다품목 수익관리 원장(ledger).
 *
 * UEX에서 선택한 상품·매수/매도 후보와 품목별 수량(SCU)을 원장에 추가해
 * 총매수·총매도·총이윤을 한눈에 관리한다. localStorage에 저장(새로고침 유지).
 * 공용 유틸(포매터·토스트·i18n)은 main.js에서 init(deps)로 주입, UEX 선택 정보는
 * VOLT_UEX_PANEL(전역)에서 읽는다.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'volt-trade-ledger';

    let escapeHtml, formatCredits, i18nT, showToast;
    let items = [];

    function init(deps) {
        ({ escapeHtml, formatCredits, i18nT, showToast } = deps || {});
        items = load();
    }

    function load() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(raw) ? raw.filter(isValidItem) : [];
        } catch (error) {
            return [];
        }
    }

    function isValidItem(it) {
        return it && typeof it === 'object' && Number.isFinite(it.qty)
            && Number.isFinite(it.buyPrice) && Number.isFinite(it.sellPrice);
    }

    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (error) { /* quota */ }
    }

    function makeId() {
        return `L${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    }

    // UEX 패널의 현재 선택(상품·매수·매도)과 수량 입력으로 원장 항목을 추가한다.
    function addFromUex() {
        const panel = window.VOLT_UEX_PANEL;
        const model = panel && panel.getCurrentModel ? panel.getCurrentModel() : null;
        if (!model || !model.bestBuy || !model.bestSell) {
            showToast(i18nT('ledger.errNoModel', '먼저 UEX에서 상품과 매수·매도 후보를 선택하세요.'));
            return;
        }
        const qtyInput = document.getElementById('ledger-qty');
        const qty = Math.floor(Number(qtyInput && qtyInput.value) || 0);
        if (qty <= 0) {
            showToast(i18nT('ledger.errQty', '수량(SCU)을 1 이상 입력하세요.'));
            return;
        }
        const fmtLoc = panel.formatLocation || ((row) => (row && row.terminal_name) || '');
        items.push({
            id: makeId(),
            commodity: model.commodityLabel || model.commodityName || '',
            buyLoc: fmtLoc(model.bestBuy),
            buyPrice: Number(model.bestBuy.price_buy) || 0,
            sellLoc: fmtLoc(model.bestSell),
            sellPrice: Number(model.bestSell.price_sell) || 0,
            qty,
        });
        save();
        render();
        if (qtyInput) qtyInput.value = '';
        showToast(i18nT('ledger.added', '원장에 추가했습니다.'));
    }

    function removeItem(id) {
        items = items.filter((it) => it.id !== id);
        save();
        render();
    }

    function clearAll() {
        if (!items.length) return;
        items = [];
        save();
        render();
    }

    function totals() {
        return items.reduce((acc, it) => {
            acc.qty += it.qty;
            acc.buy += it.buyPrice * it.qty;
            acc.sell += it.sellPrice * it.qty;
            return acc;
        }, { qty: 0, buy: 0, sell: 0 });
    }

    function profitClass(v) {
        return v > 0 ? ' ledger-profit-pos' : v < 0 ? ' ledger-profit-neg' : '';
    }

    function render() {
        const list = document.getElementById('ledger-list');
        const actions = document.getElementById('ledger-actions');
        if (!list) return;
        if (!items.length) {
            list.innerHTML = `<div class="ledger-empty">${escapeHtml(i18nT('ledger.empty', '아직 추가된 무역품이 없습니다.'))}</div>`;
            if (actions) actions.hidden = true;
            return;
        }
        const t = totals();
        const rows = items.map((it) => {
            const buyTotal = it.buyPrice * it.qty;
            const sellTotal = it.sellPrice * it.qty;
            const profit = sellTotal - buyTotal;
            return `<tr>
                <td class="ledger-commodity">${escapeHtml(it.commodity)}</td>
                <td>${escapeHtml(it.buyLoc)}<small>${escapeHtml(formatCredits(it.buyPrice))} / SCU</small></td>
                <td>${escapeHtml(it.sellLoc)}<small>${escapeHtml(formatCredits(it.sellPrice))} / SCU</small></td>
                <td class="ledger-num">${escapeHtml(it.qty.toLocaleString())} SCU</td>
                <td class="ledger-num">${escapeHtml(formatCredits(buyTotal))}</td>
                <td class="ledger-num">${escapeHtml(formatCredits(sellTotal))}</td>
                <td class="ledger-num ledger-profit${profitClass(profit)}">${escapeHtml(formatCredits(profit))}</td>
                <td><button class="ledger-remove" type="button" data-ledger-remove="${escapeHtml(it.id)}" aria-label="${escapeHtml(i18nT('ledger.col.remove', '삭제'))}">×</button></td>
            </tr>`;
        }).join('');
        const totalProfit = t.sell - t.buy;
        list.innerHTML = `<div class="ledger-table-wrap"><table class="ledger-table">
            <thead><tr>
                <th>${escapeHtml(i18nT('ledger.col.commodity', '품목'))}</th>
                <th>${escapeHtml(i18nT('ledger.col.buy', '구입처'))}</th>
                <th>${escapeHtml(i18nT('ledger.col.sell', '판매처'))}</th>
                <th class="ledger-num">${escapeHtml(i18nT('ledger.col.qty', '수량'))}</th>
                <th class="ledger-num">${escapeHtml(i18nT('ledger.col.buyTotal', '총매수'))}</th>
                <th class="ledger-num">${escapeHtml(i18nT('ledger.col.sellTotal', '총매도'))}</th>
                <th class="ledger-num">${escapeHtml(i18nT('ledger.col.profit', '이윤'))}</th>
                <th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr class="ledger-total-row">
                <th colspan="3">${escapeHtml(i18nT('ledger.total', '합계'))}</th>
                <td class="ledger-num">${escapeHtml(t.qty.toLocaleString())} SCU</td>
                <td class="ledger-num">${escapeHtml(formatCredits(t.buy))}</td>
                <td class="ledger-num">${escapeHtml(formatCredits(t.sell))}</td>
                <td class="ledger-num ledger-profit${profitClass(totalProfit)}">${escapeHtml(formatCredits(totalProfit))}</td>
                <td></td>
            </tr></tfoot>
        </table></div>`;
        if (actions) actions.hidden = false;
    }

    function setup() {
        document.getElementById('ledger-add')?.addEventListener('click', addFromUex);
        document.getElementById('ledger-clear')?.addEventListener('click', clearAll);
        document.getElementById('ledger-list')?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-ledger-remove]');
            if (btn) removeItem(btn.getAttribute('data-ledger-remove'));
        });
        render();
    }

    // 화물량 입력 시, 수량 입력칸이 비어 있으면 기본값으로 채운다(편의).
    function onCargoChange() {
        const cargo = document.getElementById('logistics-cargo');
        const qty = document.getElementById('ledger-qty');
        if (cargo && qty && !qty.value && Number(cargo.value) > 0) qty.value = String(Math.floor(Number(cargo.value)));
    }

    window.VOLT_TRADE_PLANNER = {
        init,
        setup,
        onLanguageChange: render,   // 언어 토글 시 헤더/라벨 재렌더
        onCargoChange,
        // 구(舊) 인터페이스 호환용 no-op (uex-panel 콜백 등)
        renderRecommendation: () => {},
        copyBriefing: () => {},
        shareBriefing: () => {},
        getOperationSummary: () => '',
    };
})();
