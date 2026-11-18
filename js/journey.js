/* Cross-tool choices and next actions. No external site's data or calculations are used. */
(function () {
    'use strict';
    const calc = window.VOLT_JOURNEY_CALC;
    const KEY = 'volt-journey-v1';
    const initial = { shipId: '', shipLabel: '', loadout: null, budget: null, quantity: null, mode: 'buy', commodityId: null, buyTerminal: null, sellTerminal: null, mineralId: '', locationId: '', crafts: [] };
    let state = { ...initial }, mining = null, crafting = null, items = null, korean = null, pendingCatalog = null, deps = {}, tradeModel = null, initialized = false;
    const tr = (ko, en) => window.VOLT_I18N?.getLang?.() === 'en' ? en : ko;
    const name = value => value?.[window.VOLT_I18N?.getLang?.() === 'en' ? 'en' : 'ko'] || value?.en || '';
    const number = value => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—';
    function el(tag, text, klass) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (klass) node.className = klass; return node; }
    function button(label, action, klass = '') { const node = el('button', label, klass); node.type = 'button'; node.addEventListener('click', action); return node; }
    function note(ko, en) { return el('p', tr(ko, en), 'journey-note'); }
    function persist() { if (!initialized) return; try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (_error) { /* Choices can still be used without storage. */ } }
    function update(patch) { state = { ...state, ...patch }; persist(); renderBars(); }
    function ship(shipId, label, loadout) {
        if (!shipId) return;
        const changed = state.shipId !== shipId;
        update({ shipId, shipLabel: label || shipId, ...(changed ? { loadout: null } : {}), ...(loadout ? { loadout } : {}) });
    }
    function transport(shipId, label) {
        if (!state.shipId) ship(shipId, label);
        else renderBars();
    }
    function currentContext(origin) {
        return { kind: 'journey', origin, shipId: state.shipId || null, loadout: state.loadout, transportShipId: document.getElementById('logistics-ship')?.value || null,
            cargoScu: calc.amount(document.getElementById('logistics-cargo')?.value), budget: state.budget, quantity: state.quantity, mode: state.mode,
            commodityId: state.commodityId, buyTerminal: state.buyTerminal, sellTerminal: state.sellTerminal,
            mineralId: state.mineralId || null, locationId: state.locationId || null, crafts: state.crafts.map(({ id, count }) => ({ id, count })) };
    }
    function ask(origin) {
        window.VOLT_AI?.openContext?.(currentContext(origin), state.shipLabel || tr('현재 선택', 'Current selection'));
        window.VOLT_APP?.showSection?.('ai');
    }
    function open(section) {
        if (section === 'craft') { window.VOLT_APP?.showSection?.('mining'); showCrafts(); return; }
        if (section === 'mining') { window.VOLT_APP?.showSection?.('mining'); if (state.mineralId || state.locationId) window.VOLT_MINING?.open?.(state.mineralId, state.locationId); return; }
        if (section === 'planner' && document.getElementById('logistics-ship')?.value) { window.VOLT_APP?.showSection?.('trade-planner'); renderBars(); return; }
        if (section === 'planner' && state.shipId && !window.VOLT_TOOLS?.canPlan?.(state.shipId)) {
            window.VOLT_APP?.showSection?.('trade-planner');
            deps.toast?.(tr('일반 화물을 운반할 함선을 별도로 골라 주세요. 채광선의 원광 공간은 일반 화물량에 포함하지 않습니다.', 'Choose a transport ship separately. Mining ore storage is not general cargo capacity.'));
            document.getElementById('logistics-ship-search')?.focus(); return;
        }
        if (state.shipId && ['ship', 'loadout', 'planner'].includes(section)) window.VOLT_TOOLS?.open?.(section, state.shipId);
        else window.VOLT_APP?.showSection?.(section === 'planner' ? 'trade-planner' : section === 'ship' ? 'ships' : section);
    }
    function renderBars() {
        for (const [section, hostId] of [['loadout', 'loadout-app'], ['mining', 'mining-app'], ['trade', 'logistics-ship-summary']]) {
            const host = document.getElementById(hostId); if (!host) continue;
            let bar = document.getElementById(`journey-${section}`);
            if (!bar) { bar = el('nav', undefined, 'journey-bar'); bar.id = `journey-${section}`; host.before(bar); }
            bar.setAttribute('aria-label', tr('선택한 정보로 이어서 보기', 'Continue with your selection'));
            bar.replaceChildren();
            bar.hidden = !state.shipId && !state.mineralId && !state.crafts.length;
            if (bar.hidden) continue;
            const summary = el('div', undefined, 'journey-selection');
            summary.append(el('span', tr('이어서 보기', 'Continue')), el('strong', state.shipLabel || tr('채광·제작 계획', 'Mining and crafting')));
            if (state.loadout) summary.append(el('small', tr(`장착 구성 ${state.loadout.slot} 유지`, `Equipment build ${state.loadout.slot} retained`)));
            if (section === 'trade' && document.getElementById('logistics-ship')?.value !== state.shipId) summary.append(el('small', tr(`운송 함선: ${document.getElementById('logistics-ship-search')?.value || '선택 필요'}`, `Transport: ${document.getElementById('logistics-ship-search')?.value || 'select a ship'}`)));
            bar.append(summary);
            const actions = el('div', undefined, 'journey-links');
            for (const [target, ko, en] of [['ship', '함선 DB', 'ShipDB'], ['loadout', '로드아웃', 'Loadout'], ['planner', '무역', 'Trade'], ['mining', '채광', 'Mining'], ['craft', `제작 계획${state.crafts.length ? ` (${state.crafts.length})` : ''}`, `Craft plan${state.crafts.length ? ` (${state.crafts.length})` : ''}`]]) {
                if ((target === 'ship' || target === 'loadout') && !state.shipId) continue;
                const link = button(tr(ko, en), () => open(target));
                if (target === section || (target === 'planner' && section === 'trade')) link.setAttribute('aria-current', 'page');
                actions.append(link);
            }
            actions.append(button(tr('AI로 현재 계획 검토', 'Review plan with AI'), () => ask(section), 'journey-primary'));
            bar.append(actions);
        }
    }
    async function catalog() {
        if (crafting && mining && items) return;
        if (!pendingCatalog) pendingCatalog = Promise.all(['/data/loadout/crafting.json', '/data/mining/mining.json', '/data/loadout/items.json', '/data/loadout/ko.json', '/data/loadout/meta.json'].map(async url => {
            const response = await fetch(url); if (!response.ok) throw new Error('Source unavailable'); return response.json();
        })).then(([c, m, i, k, meta]) => {
            if (c.source !== 'game-files' || m.source !== 'game-files' || c.gameVersion !== m.gameVersion || c.gameVersion !== meta.gameVersion) throw new Error('Source version mismatch');
            crafting = c; mining = m; items = i.items; korean = k;
        }).finally(() => { pendingCatalog = null; });
        return pendingCatalog;
    }
    function resource(id) { return name(crafting?.resources?.[id]) || id; }
    function recipeName(id) {
        const entry = Object.entries(items || {}).find(([, item]) => item.cls === id);
        if (!entry) return tr('부품 자료 없음', 'Component unavailable');
        const [key, item] = entry;
        return (window.VOLT_I18N?.getLang?.() !== 'en' && korean?.names?.[key]) || item.name || id;
    }
    function findMineral(id) { return mining?.minerals.find(row => row.id === id || row.refined?.id === id); }
    async function addCraft(id) {
        try {
            await catalog();
            if (!Object.hasOwn(crafting.recipes, id)) return;
            const existing = state.crafts.find(row => row.id === id);
            const next = existing ? state.crafts.map(row => row.id === id ? { ...row, count: Math.min(100, row.count + 1) } : row) : [...state.crafts, { id, count: 1 }].slice(0, 30);
            update({ crafts: next });
            window.VOLT_APP?.showSection?.('mining'); showCrafts();
        } catch (_error) { deps.toast?.(tr('제작 자료를 불러오지 못했습니다. 다시 시도해 주세요.', 'Crafting data could not be loaded. Please retry.')); }
    }
    async function showCrafts() {
        const root = document.getElementById('mining-app'); if (!root) return;
        let panel = document.getElementById('journey-crafts');
        if (!panel) { panel = el('section', undefined, 'journey-crafts'); panel.id = 'journey-crafts'; root.before(panel); }
        panel.hidden = false; panel.replaceChildren(note('제작 자료를 불러오는 중…', 'Loading crafting data…'));
        try { await catalog(); renderCrafts(); panel.querySelector('h3')?.focus({ preventScroll: false }); }
        catch (_error) { panel.replaceChildren(note('제작 자료를 불러오지 못했습니다.', 'Crafting data could not be loaded.'), button(tr('다시 시도', 'Retry'), showCrafts)); }
    }
    function renderCrafts() {
        const panel = document.getElementById('journey-crafts'); if (!panel || !crafting) return;
        panel.replaceChildren();
        const header = el('div', undefined, 'journey-heading'), title = el('h3', tr('제작 계획 · 필요한 재료', 'Craft plan · required materials')); title.tabIndex = -1;
        header.append(title, button(tr('접기', 'Collapse'), () => { panel.hidden = true; document.getElementById('journey-mining')?.querySelector('button')?.focus(); })); panel.append(header);
        if (!state.crafts.length) { panel.append(note('로드아웃의 부품 상세 → 제작에서 부품을 추가하세요. 여러 부품에 필요한 재료를 함께 모아 보여줍니다.', 'Add parts from Loadout → component details → Crafting. Required materials are combined across parts.'), button(tr('로드아웃에서 부품 고르기', 'Choose components in Loadout'), () => open('loadout'))); return; }
        const list = el('div', undefined, 'journey-craft-items');
        for (const row of state.crafts) {
            const line = el('div', undefined, 'journey-craft-item'), label = recipeName(row.id);
            line.append(el('strong', label));
            const input = el('input'); input.type = 'number'; input.min = '1'; input.max = '100'; input.step = '1'; input.value = row.count; input.setAttribute('aria-label', `${label} · ${tr('제작 개수', 'quantity')}`);
            input.addEventListener('input', () => {
                const count = Number(input.value); if (!Number.isInteger(count) || count < 1 || count > 100) return;
                update({ crafts: state.crafts.map(item => item.id === row.id ? { ...item, count } : item) }); renderCraftMaterials(panel);
            });
            input.addEventListener('blur', () => { input.value = state.crafts.find(item => item.id === row.id)?.count || row.count; });
            line.append(input, button(tr('빼기', 'Remove'), () => { update({ crafts: state.crafts.filter(item => item.id !== row.id) }); renderCrafts(); panel.querySelector('h3')?.focus(); })); list.append(line);
        }
        panel.append(list);
        renderCraftMaterials(panel);
    }
    function renderCraftMaterials(panel) {
        panel.querySelector('.journey-craft-totals')?.remove();
        const target = el('div', undefined, 'journey-craft-totals');
        const result = calc.materials(crafting, state.crafts), rows = el('div', undefined, 'journey-materials');
        for (const material of result.materials) {
            const row = el('article', undefined, 'journey-material'); row.dataset.journeyResource = material.id;
            row.append(el('strong', resource(material.id)), el('b', `${number(material.amount)} ${material.unit === 'SCU' ? 'SCU' : tr('개', 'pieces')}`));
            const mineral = findMineral(material.id), links = el('div', undefined, 'journey-links');
            if (mineral) links.append(button(tr('캐는 곳', 'Where to mine'), () => { update({ mineralId: mineral.id, locationId: '' }); window.VOLT_MINING?.open?.(mineral.id); panel.hidden = true; }));
            else row.append(note('채집 장소 자료 없음', 'No verified gathering locations'));
            links.append(button(tr('판매처 확인', 'Check market'), () => marketResource(material.id, 'buy'))); row.append(links); rows.append(row);
        }
        target.append(rows, note('게임 파일 · 설계도 첫 단계 재료 합계입니다. SCU와 낱개는 따로 계산합니다. 채굴량·정제 수율·제작 품질은 추정하지 않습니다.', 'Game files · totals for the first recipe tier. SCU and pieces are kept separate. Mining yield, refining output and crafted quality are not estimated.'));
        if (result.missing.length) target.append(note('일부 설계도 자료가 없어 합계가 불완전합니다. 해당 부품을 다시 선택해 주세요.', 'Some recipes are unavailable. Totals are incomplete; please reselect those parts.'));
        target.append(button(tr('AI로 재료 확보 계획 검토', 'Review material plan with AI'), () => ask('craft'), 'journey-primary')); panel.append(target);
    }
    async function marketResource(id, mode = 'sell') {
        try {
            await catalog();
            const mineral = findMineral(id), sold = mineral?.refined || mineral;
            const entry = crafting.resources[id] || sold?.name;
            const marketName = entry?.en || sold?.name?.en;
            if (!marketName) { deps.toast?.(tr('연결할 상품 자료가 없습니다.', 'No verified commodity mapping.')); return; }
            update({ mode, quantity: null, ...(mineral ? { mineralId: mineral.id } : {}) });
            open('planner');
            const found = await window.VOLT_UEX_PANEL?.openCommodity?.({ name: marketName });
            if (!found) deps.toast?.(tr('일치하는 UEX 상품을 찾지 못했습니다. 상품명을 직접 검색해 주세요.', 'No unique UEX commodity match. Please search for the commodity.'));
            renderTradeControls();
        } catch (_error) { deps.toast?.(tr('상품 자료를 불러오지 못했습니다.', 'Commodity data could not be loaded.')); }
    }
    function miningSelection(mineralId, locationId) {
        update({ mineralId: mineralId || '', locationId: locationId || '' });
    }
    function drawMiningActions(mineral) {
        const detail = document.querySelector('#mining-app .mining-detail'); if (!detail || !mineral) return;
        const block = el('div', undefined, 'journey-mining-next'), sold = mineral.refined || mineral;
        block.append(el('strong', tr('채집 다음 단계', 'After gathering')));
        block.append(note(mineral.refined ? `정제 후 상품: ${name(sold.name)} · 정제 수율과 시간 자료는 없습니다.` : '정제 없이 판매하는 상품입니다. 실제 보유량을 직접 입력하세요.', mineral.refined ? `Refined commodity: ${name(sold.name)} · refinery yields and times are unavailable.` : 'This commodity is sold without refining. Enter the quantity actually held.'));
        const links = el('div', undefined, 'journey-links');
        links.append(button(tr('팔 곳 찾기', 'Find buyers'), () => marketResource(sold.id)), button(tr('제작에 쓰는 부품 보기', 'Find recipes using this material'), () => showUses(sold.id)), button(tr('AI로 채광 계획 검토', 'Review mining plan with AI'), () => ask('mining')));
        block.append(links); detail.querySelector('header')?.after(block);
    }
    async function showUses(id) {
        await showCrafts(); const panel = document.getElementById('journey-crafts'); if (!crafting || !panel) return;
        const list = el('details', undefined, 'journey-recipe-list'); list.open = true;
        list.append(el('summary', tr(`${resource(id)}을 사용하는 부품`, `Components using ${resource(id)}`)));
        const found = Object.entries(crafting.recipes).filter(([, row]) => [...(row.m || []), ...(row.p || [])].some(([resourceId]) => resourceId === id));
        const search = el('input'); search.type = 'search'; search.placeholder = tr('부품 이름 검색', 'Search component names'); search.setAttribute('aria-label', search.placeholder);
        const results = el('div'); const render = () => {
            results.replaceChildren(); const matches = found.filter(([key]) => recipeName(key).toLowerCase().includes(search.value.toLowerCase()));
            results.append(el('p', tr(`${matches.length}개 부품`, `${matches.length} components`)));
            for (const [key] of matches.slice(0, 30)) results.append(button(`${recipeName(key)} +`, () => addCraft(key)));
            if (matches.length > 30) results.append(note('검색으로 범위를 좁혀 주세요. 앞의 30개를 표시합니다.', 'Showing the first 30. Narrow the search for more specific results.'));
        }; search.addEventListener('input', render); list.append(search, results); render(); panel.append(list); search.focus();
    }
    function mountTrade() {
        const anchor = document.getElementById('profit-selection-panel'); if (!anchor || document.getElementById('journey-trade-plan')) return;
        const panel = el('section', undefined, 'journey-trade-plan'); panel.id = 'journey-trade-plan';
        panel.append(el('h3', tr('이번 운송 계획', 'This trip')), el('div', undefined, 'journey-trade-controls'), el('div', undefined, 'journey-trade-result'));
        anchor.before(panel); renderTradeControls(); renderTrade();
    }
    function renderTradeControls() {
        const root = document.querySelector('.journey-trade-controls'); if (!root) return;
        root.replaceChildren();
        const mode = el('select'); mode.id = 'journey-trade-mode'; mode.setAttribute('aria-label', tr('운송 방식', 'Trade mode'));
        for (const [value, ko, en] of [['buy', '사서 운송', 'Buy and haul'], ['sell', '이미 가진 상품 판매', 'Sell cargo already held']]) { const option = el('option', tr(ko, en)); option.value = value; mode.append(option); }
        mode.value = state.mode; mode.addEventListener('change', () => { update({ mode: mode.value }); renderTrade(); }); root.append(mode);
        for (const [key, ko, en] of [['budget', '사용할 자금 (aUEC)', 'Budget (aUEC)'], ['quantity', '운송할 양 (SCU)', 'Quantity (SCU)']]) {
            const label = el('label', tr(ko, en)), input = el('input'); input.type = 'number'; input.min = '0'; input.max = key === 'budget' ? '10000000000' : '100000'; input.step = key === 'budget' ? '1' : '.001'; input.id = `journey-${key}`; input.placeholder = tr('직접 입력', 'Enter amount'); input.value = state[key] ?? '';
            input.addEventListener('input', () => { const value = calc.amount(input.value); update({ [key]: input.validity.valid ? value : null }); renderTrade(); });
            label.append(input); root.append(label);
        }
        root.append(button(tr('가능한 양 채우기', 'Fill available capacity'), () => {
            const capacity = calc.amount(document.getElementById('logistics-cargo')?.value);
            update({ quantity: capacity }); document.getElementById('journey-quantity').value = capacity ?? ''; renderTrade();
        }));
    }
    function tradeSelection(model) {
        if (!model && !document.getElementById('uex-commodity-select')?.value && !tradeModel) { renderTrade(); return; }
        tradeModel = model;
        update({ commodityId: Number(model?.commodityId || document.getElementById('uex-commodity-select')?.value) || null, buyTerminal: Number(model?.bestBuy?.id_terminal) || null, sellTerminal: Number(model?.bestSell?.id_terminal) || null });
        renderTrade();
    }
    function tradeChoices() { return { mode: state.mode, budget: state.budget, quantity: state.quantity, capacity: calc.amount(document.getElementById('logistics-cargo')?.value) }; }
    function renderTrade() {
        const root = document.querySelector('.journey-trade-result'); if (!root) return;
        document.querySelector('#journey-trade-plan h3').textContent = tr('이번 운송 계획', 'This trip');
        root.replaceChildren();
        const budgetInput = document.getElementById('journey-budget'); if (budgetInput) budgetInput.disabled = state.mode === 'sell';
        document.getElementById('trade-planner')?.classList.remove('has-trip-plan');
        if (!tradeModel) { root.append(note('상품과 거래 후보를 고르면 구매·운송·판매 순서로 보여줍니다. 입력한 자금은 화면을 이동해도 유지됩니다.', 'Select a commodity and trade locations to see the steps. Your budget is retained when switching tools.')); return; }
        const model = tradeModel, result = calc.trade(model.bestBuy, model.bestSell, tradeChoices());
        document.getElementById('trade-planner')?.classList.toggle('has-trip-plan', result.status === 'ok' || state.mode === 'sell');
        const formatLocation = row => window.VOLT_UEX_PANEL?.formatLocation?.(row) || tr('장소 미선택', 'No location selected');
        root.append(el('strong', model.commodityLabel || model.commodityName));
        const steps = el('ol', undefined, 'journey-steps');
        for (const [title, detail] of [
            [state.mode === 'sell' ? tr('보유 상품', 'Cargo held') : tr('구매', 'Buy'), state.mode === 'sell' ? tr('채광·정제 후 실제 보유량을 입력하세요.', 'Enter the amount actually held after mining or refining.') : formatLocation(model.bestBuy)],
            [tr('적재', 'Load'), `${document.getElementById('logistics-ship-search')?.value || tr('운송 함선 선택 필요', 'Select a transport ship')} · ${number(result.quantity)} SCU`],
            [tr('판매', 'Sell'), formatLocation(model.bestSell)],
        ]) { const li = el('li'); li.append(el('span', title), el('strong', detail)); steps.append(li); }
        root.append(steps);
        const statuses = { unavailable: ['매수 또는 매도 가격 자료가 없습니다.', 'Buy or sell prices are unavailable.'], stale: ['선택한 장소의 60분 이내 시세가 없어 금액 계산을 보류합니다. 가격을 새로 조회해 주세요.', 'Calculation paused: selected locations have no price report within 60 minutes. Refresh prices.'], quantity: ['함선 화물량과 실제 운송할 양을 입력하세요.', 'Enter cargo capacity and the quantity to transport.'], budget: ['사서 운송할 때는 사용할 자금을 입력하세요.', 'Enter a budget before buying cargo.'] };
        if (result.status !== 'ok') root.append(note(...statuses[result.status]));
        else {
            const stats = el('dl', undefined, 'journey-totals');
            for (const [label, value, unit] of [[tr('계산 수량', 'Planned quantity'), result.quantity, 'SCU'], [tr('구매 금액', 'Purchase cost'), result.cost, 'aUEC'], [tr('판매 금액', 'Sale value'), result.revenue, 'aUEC'], [tr('매매 차익', 'Trade margin'), result.profit, 'aUEC']]) {
                if (state.mode === 'sell' && value === null) continue;
                const entry = el('div'); entry.append(el('dt', label), el('dd', `${number(value)} ${unit}`)); stats.append(entry);
            } root.append(stats);
            if (result.limited) root.append(note('자금·화물량·보고된 재고와 수요에 맞춰 수량을 줄였습니다.', 'Quantity was reduced to fit budget, capacity and reported stock/demand.'));
            if (state.mode === 'sell') root.append(note('구매 원가를 모르므로 이익이 아닌 판매 금액만 표시합니다.', 'Only sale value is shown; profit requires a known acquisition cost.'));
        }
        root.append(note(`UEX 시세·재고 제보 · 재고 ${number(result.stock)} / 수요 ${number(result.demand)} SCU. —는 자료 없음입니다. 실제 거래 가능량을 보장하지 않습니다.`, `UEX price/stock reports · stock ${number(result.stock)} / demand ${number(result.demand)} SCU. — means unknown. Availability is not guaranteed.`));
        root.append(note('연료비·적재 시간·상자 배치는 계산하지 않습니다. 화물량은 플래너 입력값입니다. 아래 다품목 수익표는 별도 계획이며 이 자금을 자동으로 차감하지 않습니다.', 'Fuel costs, loading times and box placement are not calculated. Capacity is the planner input. The multi-item ledger below is a separate plan and does not deduct from this budget.'));
        const actions = el('div', undefined, 'journey-links');
        if (model.bestSell?.id_terminal) actions.append(button(tr('판매한 곳에서 다음 운송 찾기', 'Find next cargo at destination'), () => nextCargo(model.bestSell)));
        actions.append(button(tr('AI로 이 운송 계획 검토', 'Review this trip with AI'), () => ask('trade'), 'journey-primary'));
        root.append(actions);
    }
    async function nextCargo(place) {
        const root = document.querySelector('.journey-trade-result'); if (!root) return;
        let panel = document.getElementById('journey-next-cargo'); if (!panel) { panel = el('div', undefined, 'journey-next-cargo'); panel.id = 'journey-next-cargo'; root.append(panel); }
        panel.replaceChildren(note('이 판매처에서 살 수 있는 상품을 확인하는 중…', 'Checking commodities sold at this destination…'));
        try {
            const rows = await window.VOLT_UEX.fetchUexData(`location-prices?field=id_terminal&id=${encodeURIComponent(place.id_terminal)}`, 300000);
            if (!panel.isConnected) return;
            panel.replaceChildren(el('h4', tr('다음 운송 · 출발지 유지', 'Next trip · keep this departure')));
            const fresh = rows.filter(row => Number(row.id_commodity) > 0 && Number(row.price_buy) > 0 && calc.fresh(row));
            if (!fresh.length) panel.append(note('60분 이내에 보고된 구매 가능 상품이 없습니다.', 'No buyable commodities reported within 60 minutes.'));
            for (const row of fresh.slice(0, 20)) panel.append(button(`${row.commodity_name} · ${number(Number(row.price_buy))} aUEC/SCU`, async () => {
                update({ mode: 'buy', quantity: null }); renderTradeControls();
                await window.VOLT_UEX_PANEL.openCommodity({ id: row.id_commodity, buyTerminal: place.id_terminal });
            }));
            panel.append(note('수익 순위가 아닙니다. 상품을 선택하면 이 출발지의 가격으로 다시 확인합니다.', 'This is not a profit ranking. Select a commodity to check a new trip from this location.'));
        } catch (_error) { if (panel.isConnected) panel.replaceChildren(note('다음 운송 상품을 불러오지 못했습니다.', 'Could not load commodities for the next trip.'), button(tr('다시 시도', 'Retry'), () => nextCargo(place))); }
    }
    function init(options = {}) {
        deps = options;
        try {
            const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
            if (saved && typeof saved === 'object') state = { ...initial, ...saved, crafts: Array.isArray(saved.crafts) ? saved.crafts.filter(row => typeof row.id === 'string' && Number.isInteger(row.count) && row.count > 0 && row.count <= 100).slice(0, 30) : [] };
        } catch (_error) { /* Discard malformed local choices. */ }
        initialized = true; renderBars(); mountTrade();
        window.VOLT_I18N?.onChange?.(() => { renderBars(); renderTradeControls(); renderTrade(); renderCrafts(); });
    }
    function restoreTrade() {
        if (state.commodityId) window.VOLT_UEX_PANEL?.openCommodity?.({ id: state.commodityId, buyTerminal: state.buyTerminal, sellTerminal: state.sellTerminal, focus: false });
    }
    window.VOLT_JOURNEY = { init, ship, transport, currentContext, ask, open, addCraft, showCrafts, miningSelection, drawMiningActions, tradeSelection, restoreTrade, renderTrade, marketResource, getSelection: () => ({ ...state }) };
})();
