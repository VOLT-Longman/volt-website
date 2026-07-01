/**
 * VOLT UEX 데이터/계산 계층 (main.js에서 분리)
 *
 * UEX API 호출(+캐시)과 거래 후보 가격 모델 계산만 담당하는 순수 계층이다.
 * DOM, shipById, authState, showToast 같은 UI/전역 상태는 직접 알지 않는다.
 * DOM 의존(화물량·라벨)은 main.js가 init(deps)로 주입한다.
 *
 * 로드 순서: navigation.js처럼 main.js보다 먼저 로드되어야 한다(main.js가
 * 시작 시 window.VOLT_UEX를 참조).
 */
(function () {
    'use strict';

    let deps = {};

    const UEX_API_BASE_URL = '/api/uex';
    const SUPPLY_COMMODITY_NAMES = ['Medical Supplies', 'Processed Food'];
    const HIGH_VALUE_COMMODITY_NAMES = ['Gold', 'Beryl', 'Laranite', 'Agricium', 'Diamond'];

    const uexCache = new Map();

    // init(deps): main.js가 DOM 의존만 주입한다.
    //   getCargoTarget(): number      — 현재 화물량(SCU)
    //   formatCommodityLabel(name): string — 표시용 상품 라벨
    function init(injected) {
        deps = injected || {};
    }

    function getCargoTarget() {
        return typeof deps.getCargoTarget === 'function' ? deps.getCargoTarget() : 0;
    }

    function formatCommodityLabel(name) {
        return typeof deps.formatCommodityLabel === 'function' ? deps.formatCommodityLabel(name) : name;
    }

    async function fetchUexData(path, ttlMs) {
        const cacheKey = path;
        const cached = uexCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < ttlMs) return cached.data;
        const response = await fetch(`${UEX_API_BASE_URL}/${path}`, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`UEX ${response.status}`);
        const payload = await response.json();
        const rows = Array.isArray(payload.data) ? payload.data : [];
        if ((payload.status && payload.status !== 'ok') || !Array.isArray(payload.data)) throw new Error('Invalid UEX payload');
        uexCache.set(cacheKey, { data: rows, timestamp: Date.now() });
        return rows;
    }

    // 거래 위치 유형 분류. 기준은 "우주 스테이션인가"가 아니라 자동 상하차 가능 여부:
    //   station(우주 스테이션) + city(랜딩존 도시) = 자동 상하차(auto) 그룹.
    function getLocationType(row) {
        if (!row) return 'unclassified';
        if (row.space_station_name) return 'station';
        if (row.city_name) return 'city';
        if (row.outpost_name) return 'ground';
        return 'unclassified';
    }

    function locationMatchesFilter(row, filter) {
        if (!filter || filter === 'all') return true;
        const type = getLocationType(row);
        if (filter === 'auto') return type === 'station' || type === 'city';
        if (filter === 'ground') return type === 'ground';
        return false; // 미분류는 auto/ground 어느 필터에도 포함하지 않는다.
    }

    // 항성계(Star System) 분류. UEX commodities_prices의 star_system_name을 그대로 쓴다.
    function getStarSystem(row) {
        return (row && row.star_system_name) ? row.star_system_name : '';
    }

    // 가격 데이터에 실제로 존재하는 항성계 목록(중복 제거·정렬). 칩 UI 소스로 쓴다.
    function listStarSystems(prices) {
        const set = new Set();
        (Array.isArray(prices) ? prices : []).forEach((row) => {
            const name = getStarSystem(row);
            if (name) set.add(name);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }

    // systems가 비어 있으면(전체) 모두 통과. 지정 시 해당 항성계만, 항성계 미상 행은 제외.
    function systemMatchesFilter(row, systems) {
        if (!Array.isArray(systems) || systems.length === 0) return true;
        const name = getStarSystem(row);
        return name ? systems.includes(name) : false;
    }

    // selectionState는 호출자(main.js)가 소유한다. 여기서는 인자로만 받아 갱신한다.
    // locationFilter: 'all' | 'auto'(스테이션·도시) | 'ground'(지상기지) — best 선정 입력까지 좁힌다.
    // systemFilter: 항성계 이름 배열(빈 배열=전체) — 위치 필터와 AND로 적용한다.
    function buildUexCandidateModel(prices, commodity = null, selectionState = { buyKey: '', sellKey: '' }, locationFilter = 'all', systemFilter = []) {
        const noLoc = !locationFilter || locationFilter === 'all';
        const noSys = !Array.isArray(systemFilter) || systemFilter.length === 0;
        const scoped = (noLoc && noSys)
            ? prices
            : prices.filter((row) => locationMatchesFilter(row, locationFilter) && systemMatchesFilter(row, systemFilter));
        const buyOptions = prepareUexRows(scoped, 'price_buy', 'asc');
        const sellOptions = prepareUexRows(scoped, 'price_sell', 'desc');
        const bestBuy = pickSelectedUexRow(buyOptions, 'buy', selectionState);
        const bestSell = pickSelectedUexRow(sellOptions, 'sell', selectionState);
        const cargoTarget = Math.max(0, Number(getCargoTarget()) || 0);
        const usableScu = cargoTarget;
        const profitPerScu = bestBuy && bestSell ? bestSell.price_sell - bestBuy.price_buy : 0;
        const purchaseCost = bestBuy ? bestBuy.price_buy * usableScu : 0;
        const grossRevenue = bestSell ? bestSell.price_sell * usableScu : 0;
        const estimatedProfit = grossRevenue - purchaseCost;
        const profitRate = purchaseCost > 0 ? (estimatedProfit / purchaseCost) * 100 : 0;
        const lastUpdated = prices.length ? Math.max(...prices.map((row) => row.date_modified || 0)) : 0;
        const commodityName = commodity?.name || prices[0]?.commodity_name || '선택 상품';
        return {
            commodityId: commodity?.id || prices[0]?.id_commodity || null,
            commodity,
            commodityName,
            commodityLabel: formatCommodityLabel(commodityName),
            buyOptions,
            sellOptions,
            bestBuy,
            bestSell,
            usableScu,
            profitPerScu,
            purchaseCost,
            grossRevenue,
            estimatedProfit,
            profitRate,
            rawPrices: prices,
            locationFilter: locationFilter || 'all',
            systemFilter: Array.isArray(systemFilter) ? systemFilter.slice() : [],
            availableSystems: listStarSystems(prices),
            lastUpdated,
            lastUpdatedLabel: lastUpdated ? new Date(lastUpdated * 1000).toLocaleString() : ''
        };
    }

    function prepareUexRows(prices, field, order) {
        return prices
            .filter((row) => Number(row[field]) > 0)
            .map((row) => ({ ...row, uexKey: getUexRowKey(row, field) }))
            .sort((left, right) => order === 'asc' ? left[field] - right[field] : right[field] - left[field]);
    }

    function getUexRowKey(row, field) {
        return [
            row.id_terminal,
            row.id_city,
            row.id_planet,
            row.id_space_station,
            row.terminal_name,
            row.city_name,
            row.planet_name,
            row[field]
        ].filter((value) => value !== undefined && value !== null && value !== '').join('|');
    }

    function pickSelectedUexRow(rows, side, selectionState) {
        if (!rows.length) return null;
        const key = side === 'buy' ? selectionState.buyKey : selectionState.sellKey;
        const selected = rows.find((row) => row.uexKey === key) || rows[0];
        if (side === 'buy') selectionState.buyKey = selected.uexKey;
        if (side === 'sell') selectionState.sellKey = selected.uexKey;
        return selected;
    }

    function scoreRecommendedCommodity(model) {
        const ageHours = model.lastUpdated ? Math.max(0, (Date.now() / 1000 - model.lastUpdated) / 3600) : 999;
        const freshnessBonus = ageHours <= 6 ? 5000 : ageHours <= 24 ? 2500 : 0;
        const estimatedWeight = model.estimatedProfit / 80;
        let score = model.profitPerScu * 20 + estimatedWeight + freshnessBonus;
        const isHighValue = HIGH_VALUE_COMMODITY_NAMES.includes(model.commodityName);
        const isSupply = SUPPLY_COMMODITY_NAMES.includes(model.commodityName);

        if (isSupply) score += 5000;
        if (isHighValue) score -= 3000;
        if (!model.bestBuy || !model.bestSell) score -= 30000;

        return {
            ...model,
            score,
            grade: getCommodityRecommendationGrade({ isHighValue, isSupply, profitPerScu: model.profitPerScu })
        };
    }

    function getCommodityRecommendationGrade({ isHighValue, isSupply, profitPerScu }) {
        if (isSupply) return '보급 적합';
        if (isHighValue && profitPerScu > 0) return '주의';
        return '추천';
    }

    window.VOLT_UEX = { init, fetchUexData, buildUexCandidateModel, scoreRecommendedCommodity, getLocationType, getStarSystem, listStarSystems };
})();
