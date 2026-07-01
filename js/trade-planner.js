/**
 * VOLT 무역플래너 — 다품목 수익표.
 *
 * UEX에서 선택한 상품·매수/매도 후보와 품목별 수량(SCU)을 수익표에 추가해
 * 총매수·총매도·총이윤을 한눈에 관리한다. localStorage에 저장(새로고침 유지).
 * 공용 유틸(포매터·토스트·i18n)은 main.js에서 init(deps)로 주입, UEX 선택 정보는
 * VOLT_UEX_PANEL(전역)에서 읽는다.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'volt-trade-ledger';
    const ID_RANDOM_RANGE = 10000;

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
            console.warn('Trade profit table load failed', error);
            return [];
        }
    }

    function isValidItem(it) {
        return it && typeof it === 'object' && Number.isFinite(it.qty)
            && Number.isFinite(it.buyPrice) && Number.isFinite(it.sellPrice);
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (error) {
            console.warn('Trade profit table save failed', error);
        }
    }

    function makeId() {
        return `L${Date.now().toString(36)}${Math.floor(Math.random() * ID_RANDOM_RANGE).toString(36)}`;
    }

    function t(key, fallback, vars = {}) {
        const template = i18nT ? i18nT(key, fallback) : fallback;
        return String(template || '').replace(/\{(\w+)\}/g, (_, name) => (
            Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : ''
        ));
    }

    function formatCount(value) {
        return Number(value || 0).toLocaleString();
    }

    function getQuantityValue() {
        const qtyInput = document.getElementById('ledger-qty');
        return Math.floor(Number(qtyInput?.value) || 0);
    }

    function getPanelModel() {
        const panel = window.VOLT_UEX_PANEL;
        return panel?.getCurrentModel ? panel.getCurrentModel() : null;
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function renderSelectionSummary() {
        const panel = document.getElementById('profit-selection-panel');
        if (!panel) return;
        const model = getPanelModel();
        const ready = Boolean(model?.bestBuy && model?.bestSell);
        const qty = getQuantityValue();
        panel.classList.toggle('is-ready', ready);
        setText('profit-selection-status', ready ? t('ledger.selectionReady', '추가 가능') : t('ledger.selectionWaiting', '후보 선택 대기'));
        renderSelectionLocation(model, ready);
        renderSelectionProfit(model, ready, qty);
    }

    function renderSelectionLocation(model, ready) {
        const fmtLoc = window.VOLT_UEX_PANEL?.formatLocation || ((row) => row?.terminal_name || '');
        const missing = t('ledger.selectionMissing', '후보를 선택하세요');
        setText('profit-selected-commodity', ready ? model.commodityLabel || model.commodityName || '-' : '-');
        setText('profit-selected-commodity-detail', ready ? model.commodityName || '' : '');
        setText('profit-selected-buy', ready ? fmtLoc(model.bestBuy) : missing);
        setText('profit-selected-buy-detail', ready ? `${formatCredits(Number(model.bestBuy.price_buy) || 0)} / SCU` : '');
        setText('profit-selected-sell', ready ? fmtLoc(model.bestSell) : missing);
        setText('profit-selected-sell-detail', ready ? `${formatCredits(Number(model.bestSell.price_sell) || 0)} / SCU` : '');
    }

    function renderSelectionProfit(model, ready, qty) {
        const profitEl = document.getElementById('profit-selected-profit');
        const detailEl = document.getElementById('profit-selected-profit-detail');
        const perScu = ready ? (Number(model.bestSell.price_sell) || 0) - (Number(model.bestBuy.price_buy) || 0) : 0;
        const total = ready && qty > 0 ? perScu * qty : 0;
        if (profitEl) {
            profitEl.textContent = ready ? formatCredits(qty > 0 ? total : perScu) : '-';
            profitEl.className = profitClass(total || perScu).trim();
        }
        if (detailEl) {
            detailEl.textContent = ready && qty > 0
                ? `${t('ledger.selectionQtyHint', '{qty} SCU 기준', { qty: formatCount(qty) })} · ${t('ledger.selectionPerScu', 'SCU당 {amount}', { amount: formatCredits(perScu) })}`
                : t('ledger.selectionNoQty', '수량을 입력하면 총 이윤이 계산됩니다.');
        }
    }

    // UEX 패널의 현재 선택(상품·매수·매도)과 수량 입력으로 수익표 항목을 추가한다.
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
        renderSelectionSummary();
        showToast(i18nT('ledger.added', '수익표에 추가했습니다.'));
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
        const t = totals();
        const totalProfit = t.sell - t.buy;
        if (!items.length) {
            list.innerHTML = `${renderTotalCards(t, totalProfit)}<div class="ledger-empty">${escapeHtml(i18nT('ledger.empty', '아직 추가한 상품이 없습니다. 위에서 매수·매도 후보를 선택한 뒤 수익표에 추가하세요.'))}</div>`;
            if (actions) actions.hidden = true;
            return;
        }
        list.innerHTML = `${renderTotalCards(t, totalProfit)}${renderDesktopTable(t, totalProfit)}${renderMobileCards()}`;
        if (actions) actions.hidden = false;
    }

    function renderTotalCards(total, totalProfit) {
        return `<div class="ledger-total-cards">
            ${renderTotalCard('ledger.summaryBuy', '총 투자금', formatCredits(total.buy))}
            ${renderTotalCard('ledger.summarySell', '예상 매출', formatCredits(total.sell))}
            ${renderTotalCard('ledger.summaryProfit', '예상 이윤', formatCredits(totalProfit), profitClass(totalProfit))}
            ${renderTotalCard('ledger.summaryScu', '총 SCU', `${formatCount(total.qty)} SCU`)}
        </div>`;
    }

    function renderTotalCard(key, fallback, value, cls = '') {
        return `<div class="ledger-total-card"><span>${escapeHtml(i18nT(key, fallback))}</span><strong class="${escapeHtml(cls.trim())}">${escapeHtml(value)}</strong></div>`;
    }

    function renderDesktopTable(total, totalProfit) {
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
        return `<div class="ledger-table-wrap"><table class="ledger-table">
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
                <td class="ledger-num">${escapeHtml(formatCount(total.qty))} SCU</td>
                <td class="ledger-num">${escapeHtml(formatCredits(total.buy))}</td>
                <td class="ledger-num">${escapeHtml(formatCredits(total.sell))}</td>
                <td class="ledger-num ledger-profit${profitClass(totalProfit)}">${escapeHtml(formatCredits(totalProfit))}</td>
                <td></td>
            </tr></tfoot>
        </table></div>`;
    }

    function renderMobileCards() {
        const cards = items.map((it) => {
            const profit = (it.sellPrice - it.buyPrice) * it.qty;
            return `<article class="ledger-mobile-card">
                <div><strong>${escapeHtml(it.commodity)}</strong><button class="ledger-remove" type="button" data-ledger-remove="${escapeHtml(it.id)}" aria-label="${escapeHtml(i18nT('ledger.col.remove', '삭제'))}">×</button></div>
                <dl>
                    <div><dt>${escapeHtml(i18nT('ledger.col.buy', '구입처'))}</dt><dd>${escapeHtml(it.buyLoc)} · ${escapeHtml(formatCredits(it.buyPrice))}/SCU</dd></div>
                    <div><dt>${escapeHtml(i18nT('ledger.col.sell', '판매처'))}</dt><dd>${escapeHtml(it.sellLoc)} · ${escapeHtml(formatCredits(it.sellPrice))}/SCU</dd></div>
                    <div><dt>${escapeHtml(i18nT('ledger.col.qty', '수량'))}</dt><dd>${escapeHtml(formatCount(it.qty))} SCU</dd></div>
                    <div><dt>${escapeHtml(i18nT('ledger.col.profit', '이윤'))}</dt><dd class="ledger-profit${profitClass(profit)}">${escapeHtml(formatCredits(profit))}</dd></div>
                </dl>
            </article>`;
        }).join('');
        return `<div class="ledger-mobile-list">${cards}</div>`;
    }

    function setup() {
        document.getElementById('ledger-add')?.addEventListener('click', addFromUex);
        document.getElementById('ledger-clear')?.addEventListener('click', clearAll);
        document.getElementById('ledger-qty')?.addEventListener('input', renderSelectionSummary);
        document.getElementById('ledger-list')?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-ledger-remove]');
            if (btn) removeItem(btn.getAttribute('data-ledger-remove'));
        });
        renderSelectionSummary();
        render();
    }

    // 화물량 입력 시, 수량 입력칸이 비어 있으면 기본값으로 채운다(편의).
    function onCargoChange() {
        const cargo = document.getElementById('logistics-cargo');
        const qty = document.getElementById('ledger-qty');
        if (cargo && qty && !qty.value && Number(cargo.value) > 0) qty.value = String(Math.floor(Number(cargo.value)));
        renderSelectionSummary();
    }

    function onLanguageChange() {
        renderSelectionSummary();
        render();
    }

    window.VOLT_TRADE_PLANNER = {
        init,
        setup,
        onLanguageChange,
        onCargoChange,
        refreshSelectionSummary: renderSelectionSummary,
    };
})();
