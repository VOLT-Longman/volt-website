/**
 * 채광 안내 — 광물별로 캐는 곳을, 장소별로 나오는 광물을 보여 준다.
 * - 광물·암석·장소: /data/mining/mining.json (출처: 게임 파일, scripts/mining/build-mining-data.mjs)
 * - 시세: /api/uex/commodities (출처 UEX). 받지 못해도 나머지는 그대로 보인다.
 * 비중과 함량은 게임 파일 값이며 게임 안 실측값이 아니다.
 */
(function () {
    'use strict';
    const DATA_URL = '/data/mining/mining.json';
    // 게임과 UEX의 표기만 다른 상품 (게임 id → UEX 이름).
    const UEX_ALIASES = { Raw_Ice: 'Ice (Raw)', RawSilicon: 'Silicon (Raw)', RawOuratite: 'Ouratite (Raw)' };
    const TEXT = {
        ko: {
            loading: '채광 자료를 불러오는 중입니다…', loadError: '채광 자료를 불러오지 못했습니다.', retry: '다시 시도',
            byMineral: '광물별', byLocation: '장소별', views: '보기 방식', search: '광물·장소 이름 검색', searchLabel: '검색',
            modeAll: '전체', ship: '함선 채광', vehicle: '지상 차량 채광', hand: '손 채광', modes: '채광 방식',
            mineral: '광물', method: '방식', refined: '정제 후', price: 'UEX 판매 시세', instability: '불안정성', resistance: '저항',
            noRefine: '정제 없음', priceUnknown: '시세 정보 없음', priceLoading: '시세 확인 중', priceFailed: '시세를 불러오지 못했습니다',
            noResult: '맞는 항목이 없습니다.', pick: '광물을 고르면 캐는 곳이 나옵니다.', pickLocation: '장소를 고르면 나오는 광물이 나옵니다.',
            whereTitle: '{name} — 캐는 곳', place: '장소', rock: '암석', rockShare: '암석 비중', content: '함량', chance: '포함 확률',
            placesCount: '{count}곳', system: '성계', whatTitle: '{name} — 나오는 광물', rocksCount: '암석 {count}종',
            areaNote: '이 이름은 게임에 표시되는 이름이 아니라 내부 구분을 풀어 쓴 것입니다.',
            traits: '채광 특성', window: '최적 구간 위치', windowThinness: '최적 구간 좁기', explosion: '폭발 보정값',
            sourceGame: '광물·암석·장소: Star Citizen 게임 파일 {version}', sourcePrice: '시세: UEX', sourceNote: '비중·함량·확률은 게임 파일에 적힌 값이며, 게임 안에서 실측한 값이 아닙니다.',
            perScu: 'aUEC/SCU', backToList: '목록으로', unofficial: '임시 구분명',
            priceUnitNote: '시세는 SCU당 값입니다. 손 채광 광물 한 개의 판매 가격이 아닙니다.',
            detailNote: '같은 광물이 여러 줄이면 원본의 별도 구성 항목입니다. 함량·확률을 합산하지 않습니다. 암석 비중순으로 표시하며 실제 수율 순위가 아닙니다.',
            traitsVary: '암석에 따라 특성 정의가 다릅니다. 하나로 확정할 수 없는 값은 —로 표시합니다.',
        },
        en: {
            loading: 'Loading mining data…', loadError: 'Mining data could not be loaded.', retry: 'Retry',
            byMineral: 'By mineral', byLocation: 'By location', views: 'View', search: 'Search minerals or locations', searchLabel: 'Search',
            modeAll: 'All', ship: 'Ship mining', vehicle: 'Ground vehicle mining', hand: 'Hand mining', modes: 'Mining method',
            mineral: 'Mineral', method: 'Method', refined: 'Refines to', price: 'UEX sell price', instability: 'Instability', resistance: 'Resistance',
            noRefine: 'Not refined', priceUnknown: 'No price data', priceLoading: 'Checking price', priceFailed: 'Prices could not be loaded',
            noResult: 'Nothing matches.', pick: 'Pick a mineral to see where it is mined.', pickLocation: 'Pick a location to see its minerals.',
            whereTitle: '{name} — where to mine', place: 'Location', rock: 'Rock', rockShare: 'Rock share', content: 'Content', chance: 'Chance',
            placesCount: '{count} locations', system: 'System', whatTitle: '{name} — minerals found', rocksCount: '{count} rock types',
            areaNote: 'This name is not shown in game; it spells out an internal label.',
            traits: 'Mining traits', window: 'Optimal window position', windowThinness: 'Optimal window thinness', explosion: 'Explosion modifier',
            sourceGame: 'Minerals, rocks and locations: Star Citizen game files {version}', sourcePrice: 'Prices: UEX', sourceNote: 'Shares, content and chances are the values written in the game files, not rates measured in game.',
            perScu: 'aUEC/SCU', backToList: 'Back to list', unofficial: 'Descriptive label',
            priceUnitNote: 'Prices are per SCU, not the sale price of one hand-mined gem.',
            detailNote: 'Repeated minerals are separate entries in the source composition. Content and chances are not added together. Sorted by rock share, not measured yield.',
            traitsVary: 'Traits vary between rock definitions. Values without a single confirmed definition are shown as —.',
        },
    };
    const MODES = ['ship', 'vehicle', 'hand'];
    const state = { data: null, error: false, view: 'mineral', query: '', mode: '', mineral: '', location: '', prices: null, priceState: 'loading' };
    let root = null;
    let started = false;

    const lang = () => (window.VOLT_I18N?.getLang?.() === 'en' ? 'en' : 'ko');
    const text = (key, values) => String(TEXT[lang()][key] ?? TEXT.ko[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values?.[name] ?? '');
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const label = (name) => (lang() === 'ko' && name?.ko ? name.ko : name?.en || '');
    const num = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString(lang() === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: digits }) : '—';
    const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const haystack = (name) => `${name?.ko || ''} ${name?.en || ''}`.toLowerCase();

    // 팔 때의 상품: 정제되는 광물은 정제 상품, 아니면 원석 그대로.
    function priceOf(mineral) {
        if (!state.prices) return null;
        const sold = mineral.refined || mineral;
        return state.prices.get(norm(UEX_ALIASES[sold.id] || sold.name.en)) ?? null;
    }
    function priceCell(mineral) {
        if (state.priceState === 'loading') return `<span class="mining-muted">${esc(text('priceLoading'))}</span>`;
        const price = priceOf(mineral);
        return price ? `<strong>${esc(num(price))}</strong> <small>${esc(text('perScu'))}</small>` : `<span class="mining-muted">${esc(text('priceUnknown'))}</span>`;
    }

    // Preserve every composition entry; no unverified yield formula or merging.
    function sourcesOf(mineralId) {
        const rows = [];
        for (const location of state.data.locations) {
            for (const group of location.groups) {
                for (const rock of group.rocks) {
                    for (const part of rock.minerals.filter((mineral) => mineral.id === mineralId)) rows.push({ location, mode: group.mode, rock, part });
                }
            }
        }
        return rows.sort((a, b) => (b.rock.share || 0) - (a.rock.share || 0) || label(a.location.name).localeCompare(label(b.location.name)));
    }

    function toolbar() {
        const tab = (view, key) => `<button type="button" id="mining-view-${view}" role="tab" aria-controls="mining-list-panel" class="mining-tab${state.view === view ? ' is-active' : ''}" aria-selected="${state.view === view}" data-mining-view="${view}">${esc(text(key))}</button>`;
        const chip = (mode, key) => `<button type="button" id="mining-mode-${mode || 'all'}" class="mining-chip${state.mode === mode ? ' is-active' : ''}" aria-pressed="${state.mode === mode}" data-mining-mode="${mode}">${esc(text(key))}</button>`;
        return `<div class="mining-toolbar">
            <div class="mining-tabs" role="tablist" aria-label="${esc(text('views'))}">${tab('mineral', 'byMineral')}${tab('location', 'byLocation')}</div>
            <label class="mining-search"><span class="visually-hidden">${esc(text('searchLabel'))}</span><input type="search" id="mining-search" value="${esc(state.query)}" placeholder="${esc(text('search'))}" autocomplete="off"></label>
            <div class="mining-chips" role="group" aria-label="${esc(text('modes'))}">${chip('', 'modeAll')}${MODES.map((mode) => chip(mode, mode)).join('')}</div>
        </div>`;
    }

    function mineralList() {
        const query = state.query.trim().toLowerCase();
        const list = state.data.minerals.filter((mineral) => (!state.mode || mineral.modes.includes(state.mode))
            && (!query || haystack(mineral.name).includes(query) || haystack(mineral.refined?.name).includes(query)));
        if (!list.length) return `<p class="mining-empty">${esc(text('noResult'))}</p>`;
        const sorted = [...list].sort((a, b) => (priceOf(b) || 0) - (priceOf(a) || 0) || label(a.name).localeCompare(label(b.name)));
        return `<p class="mining-note">${esc(text('priceUnitNote'))}</p><div class="mining-tablewrap"><table class="mining-table">
            <thead><tr><th scope="col">${esc(text('mineral'))}</th><th scope="col">${esc(text('method'))}</th><th scope="col">${esc(text('refined'))}</th><th scope="col" class="is-num mining-price-column">${esc(text('price'))}</th><th scope="col" class="is-num">${esc(text('instability'))}</th><th scope="col" class="is-num">${esc(text('resistance'))}</th></tr></thead>
            <tbody>${sorted.map((mineral) => `<tr class="${state.mineral === mineral.id ? 'is-selected' : ''}">
                <th scope="row"><button type="button" class="mining-rowbtn" data-mining-mineral="${esc(mineral.id)}" aria-pressed="${state.mineral === mineral.id}">${esc(label(mineral.name))}</button><span class="mining-mobile-price"><span>${esc(text('price'))}</span>${priceCell(mineral)}</span></th>
                <td>${mineral.modes.map((mode) => `<span class="mining-tag is-${esc(mode)}">${esc(text(mode))}</span>`).join(' ')}</td>
                <td>${mineral.refined ? esc(label(mineral.refined.name)) : `<span class="mining-muted">${esc(text('noRefine'))}</span>`}</td>
                <td class="is-num mining-price-column">${priceCell(mineral)}</td>
                <td class="is-num">${esc(num(mineral.instability, 1))}</td>
                <td class="is-num">${esc(num(mineral.resistance, 2))}</td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    function mineralDetail() {
        const mineral = state.data.minerals.find((item) => item.id === state.mineral);
        if (!mineral) return `<p class="mining-hint">${esc(text('pick'))}</p>`;
        const rows = sourcesOf(mineral.id).filter((row) => !state.mode || row.mode === state.mode);
        const places = new Set(rows.map((row) => row.location.id)).size;
        return `<section class="mining-detail" aria-labelledby="mining-detail-title">
            <header class="mining-detail-head"><h3 id="mining-detail-title" tabindex="-1">${esc(text('whereTitle', { name: label(mineral.name) }))}</h3><span class="mining-muted">${esc(text('placesCount', { count: places }))}</span></header>
            <p class="mining-note">${esc(text('detailNote'))}</p>${mineral.traitsVary ? `<p class="mining-note">${esc(text('traitsVary'))}</p>` : ''}
            <dl class="mining-traits" aria-label="${esc(text('traits'))}">
                <div><dt>${esc(text('instability'))}</dt><dd>${esc(num(mineral.instability, 1))}</dd></div>
                <div><dt>${esc(text('resistance'))}</dt><dd>${esc(num(mineral.resistance, 2))}</dd></div>
                <div><dt>${esc(text('window'))}</dt><dd>${esc(num(mineral.window, 2))}</dd></div>
                <div><dt>${esc(text('windowThinness'))}</dt><dd>${esc(num(mineral.windowThinness, 2))}</dd></div>
                <div><dt>${esc(text('explosion'))}</dt><dd>${esc(num(mineral.explosion, 1))}</dd></div>
                <div><dt>${esc(text('price'))}</dt><dd>${priceCell(mineral)}</dd></div>
            </dl>
            ${rows.length ? `<div class="mining-tablewrap"><table class="mining-table">
                <thead><tr><th scope="col">${esc(text('place'))}</th><th scope="col">${esc(text('method'))}</th><th scope="col">${esc(text('rock'))}</th><th scope="col" class="is-num">${esc(text('rockShare'))}</th><th scope="col" class="is-num">${esc(text('content'))}</th><th scope="col" class="is-num">${esc(text('chance'))}</th></tr></thead>
                <tbody>${rows.map((row) => `<tr>
                    <th scope="row"><button type="button" class="mining-rowbtn" data-mining-location="${esc(row.location.id)}">${esc(label(row.location.name))}</button>${!row.location.named ? ` <small class="mining-muted">${esc(text('unofficial'))}</small>` : ''} <small class="mining-muted">${esc(row.location.system || '')}</small></th>
                    <td><span class="mining-tag is-${esc(row.mode)}">${esc(text(row.mode))}</span></td>
                    <td>${esc(label(row.rock.name) || row.rock.id)}</td>
                    <td class="is-num">${esc(num(row.rock.share, 1))}%</td>
                    <td class="is-num">${esc(num(row.part.min, 1))}–${esc(num(row.part.max, 1))}%</td>
                    <td class="is-num">${esc(num(Number.isFinite(row.part.chance) ? row.part.chance * 100 : undefined))}%</td>
                </tr>`).join('')}</tbody></table></div>` : `<p class="mining-empty">${esc(text('noResult'))}</p>`}
        </section>`;
    }

    function locationList() {
        const query = state.query.trim().toLowerCase();
        const list = state.data.locations.filter((location) => (!state.mode || location.groups.some((group) => group.mode === state.mode))
            && (!query || haystack(location.name).includes(query) || location.id.toLowerCase().includes(query)));
        if (!list.length) return `<p class="mining-empty">${esc(text('noResult'))}</p>`;
        const systems = [...new Set(list.map((location) => location.system || ''))];
        return systems.map((system) => `<section class="mining-system"><h3>${esc(system)}</h3><ul class="mining-places">${list.filter((location) => (location.system || '') === system).map((location) => `<li>
            <button type="button" class="mining-place${state.location === location.id ? ' is-selected' : ''}" data-mining-location="${esc(location.id)}" aria-pressed="${state.location === location.id}">
                <strong>${esc(label(location.name))}</strong>${!location.named ? `<small class="mining-muted">${esc(text('unofficial'))}</small>` : ''}
                <span>${location.groups.map((group) => `<span class="mining-tag is-${esc(group.mode)}">${esc(text(group.mode))}</span>`).join(' ')}</span>
            </button></li>`).join('')}</ul></section>`).join('');
    }

    function locationDetail() {
        const location = state.data.locations.find((item) => item.id === state.location);
        if (!location) return `<p class="mining-hint">${esc(text('pickLocation'))}</p>`;
        const mineralName = (id) => label(state.data.minerals.find((mineral) => mineral.id === id)?.name) || id;
        const groups = location.groups.filter((group) => !state.mode || group.mode === state.mode);
        return `<section class="mining-detail" aria-labelledby="mining-detail-title">
            <header class="mining-detail-head"><h3 id="mining-detail-title" tabindex="-1">${esc(text('whatTitle', { name: label(location.name) }))}</h3><span class="mining-muted">${esc(location.system || '')}</span></header>
            ${location.kind === 'area' && !location.named ? `<p class="mining-note">${esc(text('areaNote'))}</p>` : ''}
            ${groups.map((group) => `<div class="mining-group"><h4><span class="mining-tag is-${esc(group.mode)}">${esc(text(group.mode))}</span> <span class="mining-muted">${esc(text('rocksCount', { count: group.rocks.length }))}</span></h4>
                <div class="mining-tablewrap"><table class="mining-table">
                <thead><tr><th scope="col">${esc(text('rock'))}</th><th scope="col" class="is-num">${esc(text('rockShare'))}</th><th scope="col">${esc(text('mineral'))} · ${esc(text('content'))} · ${esc(text('chance'))}</th></tr></thead>
                <tbody>${group.rocks.map((rock) => `<tr>
                    <th scope="row">${esc(label(rock.name) || rock.id)}</th>
                    <td class="is-num">${esc(num(rock.share, 1))}%</td>
                    <td><ul class="mining-parts">${rock.minerals.map((part) => `<li><button type="button" class="mining-rowbtn" data-mining-mineral="${esc(part.id)}">${esc(mineralName(part.id))}</button> <small>${esc(num(part.min, 1))}–${esc(num(part.max, 1))}% · ${esc(num(Number.isFinite(part.chance) ? part.chance * 100 : undefined))}%</small></li>`).join('')}</ul></td>
                </tr>`).join('')}</tbody></table></div></div>`).join('') || `<p class="mining-empty">${esc(text('noResult'))}</p>`}
        </section>`;
    }

    function draw(focusDetail) {
        if (!root) return;
        // 화면 전체를 이 한 곳에서 다시 그린다. 모든 동적 값은 esc()를 거친다.
        const focusId = root.contains(document.activeElement) ? document.activeElement.id : '';
        const active = focusId === 'mining-search';
        const caret = active ? document.activeElement.selectionStart : null;
        const mineralView = state.view === 'mineral';
        let html;
        if (state.error) html = `<div class="mining-status" role="alert"><p>${esc(text('loadError'))}</p><button type="button" class="btn btn-secondary" data-mining-retry>${esc(text('retry'))}</button></div>`;
        else if (!state.data) html = `<p class="mining-status" role="status">${esc(text('loading'))}</p>`;
        else html = `${toolbar()}
            <div class="mining-columns">
                <div class="mining-list" id="mining-list-panel" role="tabpanel" aria-labelledby="mining-view-${state.view}">${mineralView ? mineralList() : locationList()}</div>
                <div class="mining-side">${mineralView ? mineralDetail() : locationDetail()}</div>
            </div>
            <p class="mining-sources">${esc(text('sourceGame', { version: state.data.version }))} · ${esc(state.priceState === 'failed' ? text('priceFailed') : text('sourcePrice'))}<br>${esc(text('sourceNote'))}<br>${esc(text('priceUnitNote'))}</p>`;
        root.innerHTML = html;
        if (active) { const input = document.getElementById('mining-search'); input?.focus(); if (caret !== null) input?.setSelectionRange(caret, caret); }
        else if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
        if (focusDetail) document.getElementById('mining-detail-title')?.focus({ preventScroll: false });
    }

    function onClick(event) {
        const target = event.target.closest('button'); if (!target || !root.contains(target)) return;
        if (target.hasAttribute('data-mining-retry')) { state.error = false; load(); return; }
        if (target.dataset.miningView) { if (state.view !== target.dataset.miningView) state.query = ''; state.view = target.dataset.miningView; draw(); return; }
        if (target.hasAttribute('data-mining-mode')) { state.mode = target.dataset.miningMode; draw(); return; }
        if (target.dataset.miningMineral) { if (state.view !== 'mineral') state.query = ''; state.view = 'mineral'; state.mineral = target.dataset.miningMineral; draw(true); return; }
        if (target.dataset.miningLocation) { if (state.view !== 'location') state.query = ''; state.view = 'location'; state.location = target.dataset.miningLocation; draw(true); }
    }

    async function loadPrices() {
        try {
            const response = await fetch('/api/uex/commodities', { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(String(response.status));
            const payload = await response.json();
            state.prices = new Map((payload.data || []).filter((row) => Number(row.price_sell) > 0).map((row) => [norm(row.name), Number(row.price_sell)]));
            state.priceState = 'ready';
        } catch (_error) { state.prices = new Map(); state.priceState = 'failed'; }
        draw();
    }

    async function load() {
        draw();
        try {
            const response = await fetch(DATA_URL, { cache: 'no-cache' });
            if (!response.ok) throw new Error(String(response.status));
            state.data = await response.json();
        } catch (_error) { state.error = true; }
        draw();
        applyPending();
        if (state.data && state.priceState === 'loading') loadPrices();
    }

    function render() {
        root = document.getElementById('mining-app');
        if (!root || started) return;
        started = true;
        root.addEventListener('click', onClick);
        root.addEventListener('input', (event) => { if (event.target.id === 'mining-search') { state.query = event.target.value; draw(); } });
        window.VOLT_I18N?.onChange?.(() => draw());
        load();
    }

    // 다른 화면(로드아웃의 제작 재료)에서 광물을 지정해 연다. 정제 상품 id 로 와도 원광을 찾아 준다.
    function open(resourceId) {
        state.pending = resourceId;
        applyPending();
    }
    function applyPending() {
        if (!state.pending || !state.data) return;
        const mineral = state.data.minerals.find((item) => item.id === state.pending || item.refined?.id === state.pending);
        state.pending = '';
        if (!mineral) return;
        state.view = 'mineral'; state.query = ''; state.mode = ''; state.mineral = mineral.id;
        draw(true);
    }

    window.VOLT_MINING = { render, open };
})();
