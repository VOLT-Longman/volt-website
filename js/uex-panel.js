/**
 * VOLT UEX 패널(DOM 렌더링) 계층 — main.js에서 분리.
 *
 * UEX 거래 후보 패널의 DOM 렌더/상품 피커/위치·항성계 필터/추천 무역품 UI를 담당한다.
 * 순수 데이터/계산은 js/uex.js(VOLT_UEX), 공용 포매터·로컬라이즈·피커 헬퍼는 main.js에서
 * init(deps)로 주입받는다. 로드 순서: uex.js 다음, main.js 이전.
 */
(function () {
    'use strict';

    const uex = window.VOLT_UEX;

    // main.js가 주입하는 공용 의존성(이름 동일 → 이동한 코드 무수정).
    let escapeHtml, i18nT, formatCredits, formatPercent, formatLocalizedName,
        formatCommodityLabel, getCommodityKoreanName,
        handlePickerKeyboard, closePicker, announcePickerSelection,
        UEX_CACHE_TTL_MS, RECOMMENDED_COMMODITY_CANDIDATES;

    // UEX 패널 소유 상태(main.js에서 이동).
    let currentUexModel = null;
    let currentUexSelection = { buyKey: '', sellKey: '' };
    let currentUexLocationFilter = 'all';
    let currentUexSystemFilter = [];
    let availableUexCommodities = [];

    function init(deps) {
        ({
            escapeHtml, i18nT, formatCredits, formatPercent, formatLocalizedName,
            formatCommodityLabel, getCommodityKoreanName,
            handlePickerKeyboard, closePicker, announcePickerSelection,
            UEX_CACHE_TTL_MS, RECOMMENDED_COMMODITY_CANDIDATES,
        } = deps || {});
    }

    function t(key, fallback, vars = {}) {
        const template = i18nT ? i18nT(key, fallback) : fallback;
        return String(template || '').replace(/\{(\w+)\}/g, (_, name) => (
            Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : ''
        ));
    }

    function formatCount(value) {
        return Number(value).toLocaleString();
    }

    function formatUexLastUpdated(source, mode = 'full') {
        const timestamp = source?.date_modified || source?.lastUpdated;
        if (!timestamp) {
            return mode === 'short'
                ? t('planner.uex.updatedUnknown', '갱신 시각 미확인')
                : t('planner.uex.updatedMissing', '최근 갱신 시각을 확인할 수 없습니다.');
        }
        const time = new Date(timestamp * 1000).toLocaleString();
        if (mode === 'time') return time;
        if (mode === 'short') return `${t('planner.uex.updatedPrefix', '갱신')} ${time}`;
        return t('planner.uex.updatedFull', '최근 갱신: {time}', { time });
    }

    function refreshProfitSelection() {
        if (window.VOLT_TRADE_PLANNER?.refreshSelectionSummary) {
            window.VOLT_TRADE_PLANNER.refreshSelectionSummary();
        }
    }

    function setupUexLivePanel() {
        const select = document.getElementById('uex-commodity-select');
        const search = document.getElementById('uex-commodity-search');
        const results = document.getElementById('uex-commodity-results');
        const uexResults = document.getElementById('uex-results');
        const button = document.getElementById('uex-refresh');
        const recommendButton = document.getElementById('uex-recommend-refresh');
        const recommendResults = document.getElementById('uex-recommend-results');
        if (!select || !search || !results || !button) return;
        search.addEventListener('focus', () => renderCommodityResults(search.value));
        search.addEventListener('input', () => renderCommodityResults(search.value));
        search.addEventListener('keydown', (event) => handlePickerKeyboard(event, results, selectCommodity));
        results.addEventListener('keydown', (event) => handlePickerKeyboard(event, results, selectCommodity));
        results.addEventListener('click', (event) => {
            const option = event.target.closest('[data-commodity-id]');
            if (option) selectCommodity(option.getAttribute('data-commodity-id'));
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.uex-live-controls')) closePicker(search, results);
        });
        button.addEventListener('click', () => renderUexCommodityCandidates(select.value));
        uexResults?.addEventListener('click', handleUexCandidateClick);
        if (recommendButton) recommendButton.addEventListener('click', renderRecommendedCommodities);
        if (recommendResults) {
            recommendResults.addEventListener('click', (event) => {
                const option = event.target.closest('[data-recommended-commodity-id]');
                if (!option) return;
                const commodityId = option.getAttribute('data-recommended-commodity-id');
                selectCommodity(commodityId);
                renderUexCommodityCandidates(commodityId);
            });
        }
        document.querySelectorAll('[data-uex-loc]').forEach((locBtn) => {
            locBtn.addEventListener('click', () => {
                currentUexLocationFilter = locBtn.getAttribute('data-uex-loc') || 'all';
                updateUexLocFilterButtons();
                if (select.value) renderUexCommodityCandidates(select.value);
            });
        });
        const systemChips = document.getElementById('uex-system-chips');
        if (systemChips) {
            systemChips.addEventListener('click', (event) => {
                const chip = event.target.closest('[data-uex-system]');
                if (!chip) return;
                const value = chip.getAttribute('data-uex-system');
                if (value === '') {
                    currentUexSystemFilter = []; // 전체
                } else {
                    const next = new Set(currentUexSystemFilter);
                    if (next.has(value)) next.delete(value); else next.add(value);
                    currentUexSystemFilter = Array.from(next);
                }
                updateUexSystemChips();
                if (select.value) renderUexCommodityCandidates(select.value);
            });
        }
        updateUexLocFilterButtons();
        loadUexCommodities();
    }

    function updateUexLocFilterButtons() {
        document.querySelectorAll('[data-uex-loc]').forEach((locBtn) => {
            const active = locBtn.getAttribute('data-uex-loc') === currentUexLocationFilter;
            locBtn.classList.toggle('uex-loc-active', active);
            locBtn.setAttribute('aria-pressed', String(active));
        });
    }

    // 항성계 칩을 현재 상품의 가격 데이터에 실제로 존재하는 항성계로만 렌더한다.
    // 데이터에 없는 선택은 떨어내(stale 방지) 빈 상태 혼동을 막는다.
    function renderUexSystemChips(model) {
        const wrap = document.getElementById('uex-system-filter');
        const chips = document.getElementById('uex-system-chips');
        if (!wrap || !chips) return;
        const systems = Array.isArray(model?.availableSystems) ? model.availableSystems : [];
        if (systems.length <= 1) {
            // 항성계가 1개 이하면 필터가 무의미 → 숨기고 선택도 초기화.
            wrap.hidden = true;
            chips.innerHTML = '';
            if (currentUexSystemFilter.length) currentUexSystemFilter = [];
            return;
        }
        currentUexSystemFilter = currentUexSystemFilter.filter((name) => systems.includes(name));
        wrap.hidden = false;
        const allActive = currentUexSystemFilter.length === 0;
        const allLabel = t('planner.sys.all', '전체');
        chips.innerHTML = [
            `<button type="button" class="uex-loc-btn uex-system-chip${allActive ? ' uex-loc-active' : ''}" data-uex-system="" aria-pressed="${allActive}">${escapeHtml(allLabel)}</button>`,
            ...systems.map((name) => {
                const active = currentUexSystemFilter.includes(name);
                return `<button type="button" class="uex-loc-btn uex-system-chip${active ? ' uex-loc-active' : ''}" data-uex-system="${escapeHtml(name)}" aria-pressed="${active}">${escapeHtml(name)}</button>`;
            })
        ].join('');
    }

    function updateUexSystemChips() {
        document.querySelectorAll('#uex-system-chips [data-uex-system]').forEach((chip) => {
            const value = chip.getAttribute('data-uex-system');
            const active = value === '' ? currentUexSystemFilter.length === 0 : currentUexSystemFilter.includes(value);
            chip.classList.toggle('uex-loc-active', active);
            chip.setAttribute('aria-pressed', String(active));
        });
    }

    function getUexLocationLabel(type) {
        const ko = { station: '스테이션', city: '도시', ground: '지상기지', unclassified: '미분류' }[type] || '미분류';
        return t(`planner.badge.${type}`, ko);
    }

    // 추천 무역품 "추천 기준" 문구 — 현재 위치/항성계 필터를 그대로 따른다.
    function recommendBasisText() {
        const ko = { all: '추천 기준: 전체 거래 후보', auto: '추천 기준: 스테이션/도시 거래 후보', ground: '추천 기준: 지상기지 거래 후보' };
        const key = currentUexLocationFilter === 'auto' ? 'planner.rec.basisAuto' : currentUexLocationFilter === 'ground' ? 'planner.rec.basisGround' : 'planner.rec.basisAll';
        const base = t(key, ko[currentUexLocationFilter] || ko.all);
        // 항성계 이름은 고유명사라 KO/EN 동일 — 별도 번역 없이 덧붙인다.
        return currentUexSystemFilter.length ? `${base} · ${currentUexSystemFilter.join(', ')}` : base;
    }

    function renderUexLocBadge(row) {
        const type = uex.getLocationType ? uex.getLocationType(row) : 'unclassified';
        return `<span class="uex-loc-badge uex-loc-badge-${type}">${escapeHtml(getUexLocationLabel(type))}</span>`;
    }

    async function loadUexCommodities() {
        const select = document.getElementById('uex-commodity-select');
        const status = document.getElementById('uex-status');
        if (!select || !status) return;
        status.textContent = t('planner.uex.loadingCommodities', 'UEX 상품 목록을 불러오는 중입니다.');
        try {
            const commodities = await uex.fetchUexData('commodities', UEX_CACHE_TTL_MS.commodities);
            const visible = commodities.filter((item) => item.is_visible && item.is_available_live);
            availableUexCommodities = visible;
            select.innerHTML = `<option value="">${escapeHtml(t('planner.uex.selectCommodity', '상품 선택'))}</option>${visible.map((item) => (
                `<option value="${escapeHtml(String(item.id))}">${escapeHtml(formatCommodityLabel(item.name))}</option>`
            )).join('')}`;
            select.disabled = false;
            const search = document.getElementById('uex-commodity-search');
            if (search) search.disabled = false;
            const recommendButton = document.getElementById('uex-recommend-refresh');
            if (recommendButton) recommendButton.disabled = false;
            status.textContent = t('planner.uex.loadedCommodities', '상품 {count}종을 불러왔습니다.', { count: visible.length });
        } catch (error) {
            select.innerHTML = `<option value="">${escapeHtml(t('planner.uex.loadFailedOption', '상품 목록을 불러오지 못했습니다'))}</option>`;
            const recommendButton = document.getElementById('uex-recommend-refresh');
            if (recommendButton) recommendButton.disabled = true;
            status.textContent = t('planner.uex.apiUnstable', 'UEX API 연결이 불안정합니다. UEX Corp에서 직접 확인해 주세요.');
        }
    }

    function renderCommodityResults(query = '') {
        const input = document.getElementById('uex-commodity-search');
        const results = document.getElementById('uex-commodity-results');
        if (!input || !results) return;
        const normalized = query.trim().toLowerCase();
        const items = availableUexCommodities
            .filter((item) => !normalized || buildCommoditySearchText(item).includes(normalized));
        results.innerHTML = items.length
            ? items.map(renderCommodityOption).join('')
            : `<div class="planner-picker-empty">${escapeHtml(t('planner.uex.noSearchResults', '검색 결과가 없습니다. 영문 상품명 또는 코드로 다시 검색해 보세요.'))}</div>`;
        results.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    function buildCommoditySearchText(item) {
        return [item.name, getCommodityKoreanName(item.name), item.code, item.category_name].filter(Boolean).join(' ').toLowerCase();
    }
    function renderCommodityOption(item) {
        const selected = document.getElementById('uex-commodity-select')?.value === String(item.id);
        const korean = getCommodityKoreanName(item.name);
        const meta = [korean, item.code, item.category_name].filter(Boolean).join(' · ');
        return `<button class="planner-picker-option" type="button" role="option" aria-selected="${selected}" data-commodity-id="${escapeHtml(String(item.id))}">
            <strong>${escapeHtml(item.name)}</strong>
            ${meta ? `<span>${escapeHtml(meta)}</span>` : ''}
        </button>`;
    }

    function selectCommodity(id) {
        const item = availableUexCommodities.find((commodity) => String(commodity.id) === String(id));
        const select = document.getElementById('uex-commodity-select');
        const search = document.getElementById('uex-commodity-search');
        const button = document.getElementById('uex-refresh');
        if (!item || !select || !search || !button) return;
        select.value = String(item.id);
        search.value = formatCommodityLabel(item.name);
        button.disabled = false;
        renderCommoditySummary(item);
        currentUexModel = null;
        currentUexSelection = { buyKey: '', sellKey: '' };
        // 직전 상품의 항성계 칩은 stale이므로 조회 전까지 숨긴다.
        const systemFilterWrap = document.getElementById('uex-system-filter');
        if (systemFilterWrap) { systemFilterWrap.hidden = true; }
        const uexResults = document.getElementById('uex-results');
        if (uexResults) uexResults.innerHTML = `<div class="uex-empty">${escapeHtml(t('planner.uex.selectFirst', '상품 선택 후 거래 후보를 조회할 수 있습니다.'))}</div>`;
        refreshProfitSelection();
        announcePickerSelection(t('planner.uex.selectedAnnouncement', '{commodity} 상품을 선택했습니다.', { commodity: formatCommodityLabel(item.name) }));
        closePicker(search, document.getElementById('uex-commodity-results'));
    }

    function renderCommoditySummary(item) {
        const summary = document.getElementById('uex-commodity-summary');
        if (!summary) return;
        summary.hidden = false;
        const meta = [getCommodityKoreanName(item.name), item.code, item.category_name].filter(Boolean).join(' · ');
        summary.innerHTML = `<strong>${escapeHtml(item.name)}</strong>${meta ? `<span>${escapeHtml(meta)}</span>` : ''}<small>${escapeHtml(t('planner.uex.ready', '후보 조회 준비 완료'))}</small>`;
    }

    async function renderUexCommodityCandidates(commodityId) {
        const status = document.getElementById('uex-status');
        const results = document.getElementById('uex-results');
        if (!commodityId || !status || !results) return;
        status.textContent = t('planner.uex.loadingCandidates', '거래 후보를 조회하는 중입니다...');
        results.innerHTML = '';
        currentUexSelection = { buyKey: '', sellKey: '' };
        try {
            const prices = await uex.fetchUexData(`commodities/${encodeURIComponent(commodityId)}/prices`, UEX_CACHE_TTL_MS.prices);
            const selectedCommodity = availableUexCommodities.find((item) => String(item.id) === String(commodityId));
            // 칩 소스(항성계)는 전체 가격에서 뽑고, 사라진 선택은 떨어낸 뒤 필터를 적용한다.
            const systems = uex.listStarSystems ? uex.listStarSystems(prices) : [];
            currentUexSystemFilter = currentUexSystemFilter.filter((name) => systems.includes(name));
            const model = uex.buildUexCandidateModel(prices, selectedCommodity, currentUexSelection, currentUexLocationFilter, currentUexSystemFilter);
            currentUexModel = model;
            renderUexSystemChips(model);
            results.innerHTML = renderUexCandidateCards(model);
            status.textContent = formatUexLastUpdated(model);
            refreshProfitSelection();
        } catch (error) {
            currentUexModel = null;
            status.textContent = t('planner.uex.noResponse', 'UEX API 응답을 받지 못했습니다. UEX Corp에서 직접 확인해 주세요.');
            refreshProfitSelection();
        }
    }

    function handleUexCandidateClick(event) {
        const option = event.target.closest('[data-uex-side][data-uex-key]');
        if (!option || !currentUexModel) return;
        const side = option.getAttribute('data-uex-side');
        const key = option.getAttribute('data-uex-key');
        if (side === 'buy') currentUexSelection.buyKey = key;
        if (side === 'sell') currentUexSelection.sellKey = key;
        currentUexModel = uex.buildUexCandidateModel(currentUexModel.rawPrices, currentUexModel.commodity, currentUexSelection, currentUexLocationFilter, currentUexSystemFilter);
        document.getElementById('uex-results').innerHTML = renderUexCandidateCards(currentUexModel);
        refreshProfitSelection();
    }

    function renderUexCandidateCards(model) {
        if (!model.buyOptions.length && !model.sellOptions.length) return `<div class="uex-empty">${escapeHtml(t('planner.uex.emptyCandidates', '현재 표시할 매수·매도 후보가 없습니다.'))}</div>`;
        const warning = model.bestBuy && model.bestSell && model.profitPerScu <= 0
            ? `<p class="uex-warning">${escapeHtml(t('planner.uex.lossWarning', '현재 선택 조합은 수익이 없거나 손실이 발생할 수 있습니다.'))}</p>`
            : '';
        return `
            ${renderUexSummaryGrid(model)}
            ${warning}
            <div class="uex-candidate-layout">
                ${renderUexCandidateColumn(model, 'buy')}
                ${renderUexCandidateColumn(model, 'sell')}
            </div>`;
    }

    function renderUexSummaryGrid(model) {
        const buyPrice = model.bestBuy ? `${formatCredits(model.bestBuy.price_buy)} / SCU` : t('planner.uex.noBuy', '매수 후보 없음');
        const sellPrice = model.bestSell ? `${formatCredits(model.bestSell.price_sell)} / SCU` : t('planner.uex.noSell', '매도 후보 없음');
        return `<div class="uex-summary-grid">
            ${renderUexSummaryCard(t('planner.uex.summaryCommodity', '선택 상품'), model.commodityLabel, formatUexLastUpdated(model))}
            ${renderUexSummaryCard(t('planner.uex.summaryBuy', '선택 매수 후보'), formatUexLocation(model.bestBuy), `${buyPrice} · ${t('planner.uex.requiredFunds', '필요 자금 {amount}', { amount: formatCredits(model.purchaseCost) })}`)}
            ${renderUexSummaryCard(t('planner.uex.summarySell', '선택 매도 후보'), formatUexLocation(model.bestSell), `${sellPrice} · ${t('planner.uex.expectedRevenue', '예상 매출 {amount}', { amount: formatCredits(model.grossRevenue) })}`)}
            ${renderUexSummaryCard(t('planner.uex.summaryProfit', '예상 수익'), formatCredits(model.estimatedProfit), t('planner.uex.profitRate', '{amount} / SCU · 수익률 {rate}', { amount: formatCredits(model.profitPerScu), rate: formatPercent(model.profitRate) }))}
        </div>`;
    }

    function renderUexSummaryCard(label, title, detail) {
        return `<article class="uex-summary-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(title || t('planner.uex.unselected', '미선택'))}</strong>
            <b>${escapeHtml(detail || '')}</b>
        </article>`;
    }

    function renderUexCandidateColumn(model, side) {
        const isBuy = side === 'buy';
        const rows = isBuy ? model.buyOptions : model.sellOptions;
        const selectedKey = isBuy ? currentUexSelection.buyKey : currentUexSelection.sellKey;
        const title = isBuy ? t('planner.uex.buyColumn', '매수 후보') : t('planner.uex.sellColumn', '매도 후보');
        const filtered = (model.locationFilter && model.locationFilter !== 'all') || (Array.isArray(model.systemFilter) && model.systemFilter.length > 0);
        const empty = filtered
            ? t('planner.uex.emptyFiltered', '선택한 필터 조건에 해당하는 후보가 없습니다.')
            : (isBuy ? t('planner.uex.emptyBuy', '현재 UEX 기준 매수 후보가 없습니다.') : t('planner.uex.emptySell', '현재 UEX 기준 매도 후보가 없습니다.'));
        const summary = isBuy
            ? t('planner.uex.buySummary', '선택 화물량 {scu} SCU 기준 필요 구매 자금: {amount}', { scu: formatCount(model.usableScu), amount: formatCredits(model.purchaseCost) })
            : t('planner.uex.sellSummary', '선택 화물량 {scu} SCU 기준 예상 판매 금액: {amount}', { scu: formatCount(model.usableScu), amount: formatCredits(model.grossRevenue) });
        const cards = rows.length
            ? rows.slice(0, 8).map((row, index) => renderUexCandidateOption(row, side, selectedKey, index)).join('')
            : `<div class="uex-empty">${escapeHtml(empty)}</div>`;
        return `<section class="uex-candidate-column">
            <div class="uex-candidate-column-header">
                <h4>${escapeHtml(title)}</h4>
                <p>${escapeHtml(summary)}</p>
            </div>
            <div class="uex-candidate-list">${cards}</div>
        </section>`;
    }

    function renderUexCandidateOption(row, side, selectedKey, index) {
        const field = side === 'buy' ? 'price_buy' : 'price_sell';
        const isSelected = row.uexKey === selectedKey;
        const selected = isSelected ? ' is-selected' : '';
        const actionLabel = isSelected
            ? t('planner.uex.selected', '선택됨')
            : t(side === 'buy' ? 'planner.uex.selectBuy' : 'planner.uex.selectSell', side === 'buy' ? '매수 선택' : '매도 선택');
        const quantity = formatUexQuantity(row, side);
        return `<button class="uex-candidate-card${selected}" type="button" data-uex-side="${escapeHtml(side)}" data-uex-key="${escapeHtml(row.uexKey)}" aria-pressed="${isSelected ? 'true' : 'false'}">
            <div class="uex-candidate-top">
                <span class="uex-candidate-location">${index + 1}. ${escapeHtml(formatUexLocation(row))}</span>
                <span class="uex-candidate-tags">
                    ${renderUexLocBadge(row)}
                    ${isSelected ? `<span class="uex-candidate-selected">${escapeHtml(t('planner.uex.selected', '선택됨'))}</span>` : ''}
                </span>
            </div>
            <span class="uex-candidate-action">${escapeHtml(actionLabel)}</span>
            <strong class="uex-candidate-price">${escapeHtml(formatCredits(row[field]))} / SCU</strong>
            <div class="uex-candidate-meta">
                <small class="uex-candidate-updated">${escapeHtml(formatUexUpdated(row) || t('planner.uex.updatedUnknown', '갱신 시각 미확인'))}</small>
                ${quantity ? `<span class="uex-candidate-quantity">${escapeHtml(quantity)}</span>` : ''}
            </div>
        </button>`;
    }

    async function renderRecommendedCommodities() {
        const status = document.getElementById('uex-recommend-status');
        const results = document.getElementById('uex-recommend-results');
        const button = document.getElementById('uex-recommend-refresh');
        if (!status || !results || !button) return;
        if (!availableUexCommodities.length) {
            status.textContent = t('planner.rec.needCommodities', 'UEX 상품 목록을 먼저 불러와야 합니다.');
            return;
        }
        button.disabled = true;
        status.textContent = t('planner.rec.loading', '추천 무역품 후보를 조회하는 중입니다.');
        results.innerHTML = '';
        try {
            const models = await Promise.all(RECOMMENDED_COMMODITY_CANDIDATES.map(fetchRecommendedCommodityModel));
            const ranked = models.filter(Boolean)
                .map((model) => uex.scoreRecommendedCommodity(model))
                .sort((left, right) => right.score - left.score)
                .slice(0, 5);
            if (ranked.length) {
                results.innerHTML = ranked.map(renderRecommendedCommodityCard).join('');
            } else {
                const emptyMsg = currentUexLocationFilter !== 'all'
                    ? t('planner.rec.emptyFiltered', '현재 선택한 위치 조건에서 추천 가능한 무역품이 없습니다. 전체 필터로 변경하거나 다른 상품을 선택해 주세요.')
                    : t('planner.rec.emptyAll', '추천 가능한 거래 후보가 없습니다. UEX Corp에서 직접 확인해 주세요.');
                results.innerHTML = `<div class="uex-empty">${escapeHtml(emptyMsg)}</div>`;
            }
            status.textContent = recommendBasisText();
        } catch (error) {
            results.innerHTML = `<div class="uex-empty">${escapeHtml(t('planner.uex.apiUnstable', 'UEX API 연결이 불안정합니다. UEX Corp에서 직접 확인해 주세요.'))}</div>`;
            status.textContent = t('planner.rec.failed', '추천 무역품 조회에 실패했습니다.');
        } finally {
            button.disabled = false;
        }
    }

    async function fetchRecommendedCommodityModel(name) {
        const commodity = findCommodityByName(name);
        if (!commodity) return null;
        try {
            const prices = await uex.fetchUexData(`commodities/${encodeURIComponent(commodity.id)}/prices`, UEX_CACHE_TTL_MS.prices);
            const model = uex.buildUexCandidateModel(prices, commodity, { buyKey: '', sellKey: '' }, currentUexLocationFilter, currentUexSystemFilter);
            if (!model.bestBuy || !model.bestSell || model.profitPerScu <= 0) return null;
            return model;
        } catch (error) {
            console.warn('UEX recommendation candidate failed', name, error);
            return null;
        }
    }

    function findCommodityByName(name) {
        const normalized = name.toLowerCase();
        return availableUexCommodities.find((item) => String(item.name).toLowerCase() === normalized);
    }

    function renderRecommendedCommodityCard(model) {
        const projectedScu = model.usableScu;
        return `<article class="uex-recommend-card">
            <div>
                <strong>${escapeHtml(model.commodityLabel)}</strong>
                <span class="uex-recommend-grade">${escapeHtml(model.grade)}</span>
            </div>
            <dl>
                <div><dt>${escapeHtml(t('planner.rec.rate', '예상 이율'))}</dt><dd>${escapeHtml(formatPercent(model.profitRate))}</dd></div>
                <div><dt>${escapeHtml(t('planner.rec.profitPerScu', 'SCU당 예상 수익'))}</dt><dd>${escapeHtml(formatCredits(model.profitPerScu))}</dd></div>
                <div><dt>${escapeHtml(t('planner.rec.projectedProfit', '{scu} SCU 기준 예상 수익', { scu: formatCount(projectedScu) }))}</dt><dd>${escapeHtml(formatCredits(model.estimatedProfit))}</dd></div>
                <div><dt>${escapeHtml(t('planner.rec.buy', '매수'))}</dt><dd>${escapeHtml(formatUexLocation(model.bestBuy))} ${renderUexLocBadge(model.bestBuy)}</dd></div>
                <div><dt>${escapeHtml(t('planner.rec.sell', '매도'))}</dt><dd>${escapeHtml(formatUexLocation(model.bestSell))} ${renderUexLocBadge(model.bestSell)}</dd></div>
                <div><dt>${escapeHtml(t('planner.rec.availableQty', '거래 가능 수량'))}</dt><dd>${escapeHtml(formatUexQuantity(model.bestBuy, 'buy') || '-')} / ${escapeHtml(formatUexQuantity(model.bestSell, 'sell') || '-')}</dd></div>
                <div><dt>${escapeHtml(t('planner.rec.updated', '최근 갱신'))}</dt><dd>${escapeHtml(formatUexLastUpdated(model, 'time'))}</dd></div>
            </dl>
            <button class="btn btn-secondary" type="button" data-recommended-commodity-id="${escapeHtml(String(model.commodityId))}">${escapeHtml(t('planner.rec.select', '이 상품 선택'))}</button>
        </article>`;
    }

    function formatUexLocation(row) {
        if (!row) return t('planner.uex.unselected', '미선택');
        return [
            formatLocalizedName(row.terminal_name, 'terminals'),
            formatLocalizedName(row.city_name, 'locations'),
            formatLocalizedName(row.outpost_name, 'locations'),
            formatLocalizedName(row.space_station_name, 'locations'),
            formatLocalizedName(row.moon_name, 'locations'),
            formatLocalizedName(row.planet_name, 'locations')
        ].filter(Boolean).join(' · ');
    }

    function formatUexUpdated(row) {
        if (!row?.date_modified) return '';
        return formatUexLastUpdated(row, 'short');
    }

    function formatUexQuantity(row, side) {
        const fields = side === 'buy'
            ? ['inventory', 'stock', 'quantity', 'scu_buy']
            : ['demand', 'max_demand', 'quantity', 'scu_sell'];
        const value = fields.map((field) => row?.[field]).find((item) => Number(item) > 0);
        if (!value) return '';
        return side === 'buy'
            ? t('planner.uex.inventory', '재고 {count}', { count: formatCount(value) })
            : t('planner.uex.demand', '수요 {count}', { count: formatCount(value) });
    }

    function refreshUexModelForPlannerInputs() {
        if (!currentUexModel?.rawPrices) return;
        currentUexModel = uex.buildUexCandidateModel(currentUexModel.rawPrices, currentUexModel.commodity, currentUexSelection, currentUexLocationFilter, currentUexSystemFilter);
        const results = document.getElementById('uex-results');
        if (results) results.innerHTML = renderUexCandidateCards(currentUexModel);
        refreshProfitSelection();
    }

    window.VOLT_UEX_PANEL = {
        init,
        setup: setupUexLivePanel,
        getCurrentModel: () => currentUexModel,
        formatLocation: formatUexLocation,
        refreshForPlannerInputs: refreshUexModelForPlannerInputs,
        // 언어 토글 시 항성계 칩 라벨 재번역(모델이 있을 때만).
        onLanguageChange: () => { if (currentUexModel) renderUexSystemChips(currentUexModel); refreshProfitSelection(); },
    };
})();
