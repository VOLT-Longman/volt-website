/**
 * 운송 계약 안내 — 운송 평판 등급과, 등급마다 열리는 계약을 보여 준다.
 * 자료: /data/contracts/hauling.json (출처: 게임 파일, scripts/contracts/build-hauling-data.mjs)
 * 값은 게임 파일 그대로이며 게임 안에서 확인한 값이 아니다. 새 방식 계약에는 보상 금액이 적혀 있지 않다.
 */
(function () {
    'use strict';
    const DATA_URL = '/data/contracts/hauling.json';
    const KINDS = ['local', 'planetary', 'solar', 'interstellar', 'recover', 'other'];
    const TEXT = {
        ko: {
            loading: '운송 계약 자료를 불러오는 중입니다…', loadError: '운송 계약 자료를 불러오지 못했습니다.', retry: '다시 시도',
            ranksTitle: '운송 평판 등급', rank: '등급', needed: '필요 평판', contractsAt: '이 등급에서 받을 수 있는 계약',
            filters: '계약 걸러 보기', contractor: '의뢰처', allContractors: '의뢰처 전체', kind: '종류', allKinds: '종류 전체', myRank: '내 등급', anyRank: '등급 무관',
            local: '지역 내', planetary: '행성권', solar: '성계 내', interstellar: '성계 간', recover: '화물 회수', other: '입문·기타',
            place: '지역', rankRange: '필요 등급', minutes: '제한 시간', cargo: '화물', biggestBox: '가장 큰 상자', rep: '평판 보상', combat: '교전 가능',
            minutesValue: '{count}분', noCargo: '자료에 화물 내역 없음', boxValue: '{size} SCU 상자', count: '{count}건', noResult: '맞는 계약이 없습니다.', more: '{count}건 더 보기',
            showMissing: '화물 내역 미확인 계약도 보기', hiddenCount: '화물 내역 미확인 {count}건 숨김', includedCount: '화물 내역 미확인 {count}건 포함', placesMore: '{name} 외 {count}곳', availability: '계약 발급 가능 지역입니다. 실제 출발·도착 경로와는 다릅니다.', rankHint: '등급을 옆으로 넘겨 선택하세요.',
            sourceGame: '계약·평판: Star Citizen 게임 파일 {version}', sourceNote: '게임 파일에 적힌 값이며 게임 안에서 확인한 값이 아닙니다. 보상 금액은 이 계약 정의에서 확인되지 않았습니다. 화물 내역 미확인은 화물 없음이 아닙니다.', rawRegion: '지역 미확인', cargoOrder: '주문 {n}', atLeast: '최소 {n} SCU (상한 미확인)', unknownAmount: '수량 미확인', cargoNote: '원본 주문별 수량입니다. 같은 재료라도 서로 다른 주문을 합치거나 제거하지 않습니다.',
        },
        en: {
            loading: 'Loading hauling contracts…', loadError: 'Hauling contract data could not be loaded.', retry: 'Retry',
            ranksTitle: 'Hauling reputation ranks', rank: 'Rank', needed: 'Reputation needed', contractsAt: 'Contracts available at this rank',
            filters: 'Filter contracts', contractor: 'Contractor', allContractors: 'All contractors', kind: 'Type', allKinds: 'All types', myRank: 'My rank', anyRank: 'Any rank',
            local: 'Local', planetary: 'Planetary', solar: 'In-system', interstellar: 'Interstellar', recover: 'Cargo recovery', other: 'Intro & other',
            place: 'Region', rankRange: 'Rank needed', minutes: 'Time limit', cargo: 'Cargo', biggestBox: 'Largest box', rep: 'Reputation', combat: 'May involve combat',
            minutesValue: '{count} min', noCargo: 'No cargo listed in the data', boxValue: '{size} SCU box', count: '{count} contracts', noResult: 'No contracts match.', more: 'Show {count} more',
            showMissing: 'Include contracts with unverified cargo', hiddenCount: '{count} contracts with unverified cargo hidden', includedCount: 'Includes {count} contracts with unverified cargo', placesMore: '{name} and {count} more', availability: 'Contract availability areas, not actual pickup and delivery routes.', rankHint: 'Swipe across to choose a rank.',
            sourceGame: 'Contracts and reputation: Star Citizen game files {version}', sourceNote: 'Game-file definitions, not confirmed in game. Payouts are unavailable in these contract definitions. Missing cargo data does not mean no cargo.', rawRegion: 'Region unverified', cargoOrder: 'Order {n}', atLeast: 'At least {n} SCU (upper bound unverified)', unknownAmount: 'Quantity unavailable', cargoNote: 'Quantities are listed per source order. Identical materials in separate orders are not merged or removed.',
        },
    };
    const PAGE = 20;
    const state = { data: null, error: false, by: '', kind: '', rank: '', includeMissing: false, limit: PAGE };
    let root = null;
    let started = false;

    const lang = () => (window.VOLT_I18N?.getLang?.() === 'en' ? 'en' : 'ko');
    const text = (key, values) => String(TEXT[lang()][key] ?? TEXT.ko[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values?.[name] ?? '');
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const label = (name) => (lang() === 'ko' && name?.ko ? name.ko : name?.en || '');
    const num = (value) => (Number(value) || 0).toLocaleString(lang() === 'en' ? 'en-US' : 'ko-KR');

    const hasCargo = (contract) => Boolean(contract.cargo?.length);
    function filtered(includeMissing = state.includeMissing) {
        const rank = state.rank === '' ? null : Number(state.rank);
        return state.data.contracts.filter((contract) => (!state.by || contract.by === state.by) && (!state.kind || contract.kind === state.kind)
            && (rank === null || ((contract.min ?? 0) <= rank && (contract.max ?? 99) >= rank)) && (includeMissing || hasCargo(contract)))
            .sort((a, b) => Number(hasCargo(b)) - Number(hasCargo(a)));
    }

    function ranks() {
        const { ranks: list, contracts } = state.data;
        return `<section class="hauling-ranks" aria-labelledby="hauling-ranks-title"><h3 id="hauling-ranks-title">${esc(text('ranksTitle'))}</h3>
            <ol class="hauling-ladder">${list.map((rank, index) => {
                const available = contracts.filter((contract) => (state.includeMissing || hasCargo(contract)) && (contract.min ?? 0) <= index && (contract.max ?? 99) >= index).length;
                return `<li><button type="button" class="hauling-rank${state.rank === String(index) ? ' is-selected' : ''}" data-hauling-rank="${index}" aria-pressed="${state.rank === String(index)}">
                    <strong>${esc(label(rank.name))}</strong><span>${esc(text('needed'))} ${esc(num(rank.min))}</span><small>${esc(text('count', { count: num(available) }))}</small></button></li>`;
            }).join('')}</ol><p class="hauling-rank-hint">${esc(text('rankHint'))}</p></section>`;
    }

    function controls() {
        const { contractors, ranks: list } = state.data;
        const option = (value, name, current) => `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(name)}</option>`;
        return `<div class="hauling-filters" role="group" aria-label="${esc(text('filters'))}">
            <label><span>${esc(text('contractor'))}</span><select id="hauling-by">${option('', text('allContractors'), state.by)}${Object.entries(contractors).map(([id, name]) => option(id, label(name), state.by)).join('')}</select></label>
            <label><span>${esc(text('kind'))}</span><select id="hauling-kind">${option('', text('allKinds'), state.kind)}${KINDS.map((kind) => option(kind, text(kind), state.kind)).join('')}</select></label>
            <label><span>${esc(text('myRank'))}</span><select id="hauling-rank">${option('', text('anyRank'), state.rank)}${list.map((rank, index) => option(String(index), label(rank.name), state.rank)).join('')}</select></label>
        </div><label class="hauling-missing"><input type="checkbox" id="hauling-missing"${state.includeMissing ? ' checked' : ''}> ${esc(text('showMissing'))}</label>`;
    }

    function placesOf(contract) {
        const found = new Map();
        let unknown = false;
        for (const id of contract.places || []) {
            const place = state.data.localities[id];
            const members = place?.members || [];
            if (members.length) {
                for (const member of members) if (label(member.name)) found.set(member.id, label(member.name));
            } else {
                const name = label(place?.name || place);
                if (name && !/^Region[A-Z]$|^[A-Za-z]+And[A-Za-z]+$/.test(name)) found.set(id, name);
                else unknown = true;
            }
            if (place?.unresolved) unknown = true;
        }
        const names = [...new Set(found.values())];
        const unknownText = text('rawRegion');
        if (!names.length) return esc(unknownText);
        const values = [...names, ...(unknown ? [unknownText] : [])];
        if (values.length <= 2) return esc(values.join(' · '));
        return `<details class="hauling-places"><summary>${esc(text('placesMore', { name: names[0], count: num(names.length - 1) }))}</summary><ul>${values.map((name) => `<li>${esc(name)}</li>`).join('')}</ul><small>${esc(text('availability'))}</small></details>`;
    }

    function table() {
        const { ranks: list, contractors, resources } = state.data;
        const rows = filtered();
        const missing = filtered(true).filter((contract) => !hasCargo(contract)).length;
        const count = `<p class="hauling-count" role="status">${esc(text('count', { count: num(rows.length) }))}${missing ? ` · ${esc(text(state.includeMissing ? 'includedCount' : 'hiddenCount', { count: num(missing) }))}` : ''}</p>`;
        if (!rows.length) return `${count}<p class="hauling-empty">${esc(text('noResult'))}</p>`;
        const rankName = (index) => label(list[index]?.name) || '';
        const amount = (row) => !Number.isFinite(row.min) ? text('unknownAmount') : row.max > row.min ? `${num(row.min)}–${num(row.max)} SCU` : row.max === row.min ? `${num(row.min)} SCU` : text('atLeast', { n: num(row.min) });
        const shown = rows.slice(0, state.limit);
        return `${count}
            <div class="hauling-tablewrap" tabindex="0" role="region" aria-label="${esc(text('contractsAt'))}"><table class="hauling-table">
            <thead><tr><th scope="col">${esc(text('contractor'))}</th><th scope="col">${esc(text('kind'))}</th><th scope="col">${esc(text('place'))}</th><th scope="col">${esc(text('rankRange'))}</th><th scope="col" class="is-num">${esc(text('minutes'))}</th><th scope="col">${esc(text('cargo'))}</th><th scope="col" class="is-num">${esc(text('biggestBox'))}</th><th scope="col" class="is-num">${esc(text('rep'))}</th></tr></thead>
            <tbody>${shown.map((contract) => `<tr>
                <th scope="row" tabindex="-1">${esc(label(contractors[contract.by]))}</th>
                <td><span class="hauling-tag is-${esc(contract.kind)}">${esc(text(contract.kind))}</span>${contract.combat ? ` <span class="hauling-tag is-combat">${esc(text('combat'))}</span>` : ''}</td>
                <td>${placesOf(contract)}</td>
                <td>${esc(contract.min === contract.max ? rankName(contract.min) : `${rankName(contract.min ?? 0)} – ${rankName(contract.max ?? list.length - 1)}`)}</td>
                <td class="is-num">${contract.minutes ? esc(text('minutesValue', { count: num(contract.minutes) })) : '—'}</td>
                <td>${hasCargo(contract) ? `<ul class="hauling-cargo">${contract.cargo.map((row, index) => `<li><small>${esc(text('cargoOrder', { n: index + 1 }))}</small> ${esc(label(resources[row.resource]) || row.resource)} <strong>${esc(amount(row))}</strong></li>`).join('')}</ul>` : `<span class="hauling-muted">${esc(text('noCargo'))}</span>`}</td>
                <td class="is-num">${contract.maxBox ? esc(text('boxValue', { size: contract.maxBox })) : '—'}</td>
                <td class="is-num">${contract.rep ? `+${esc(num(contract.rep))}` : '—'}</td>
            </tr>`).join('')}</tbody></table></div>
            ${rows.length > shown.length ? `<button type="button" class="btn btn-secondary hauling-more" data-hauling-more>${esc(text('more', { count: num(Math.min(PAGE, rows.length - shown.length)) }))}</button>` : ''}`;
    }

    function draw(focusId) {
        if (!root) return;
        let html;
        // 화면 전체를 이 한 곳에서 다시 그린다. 모든 동적 값은 esc()를 거친다.
        if (state.error) html = `<div class="hauling-status" role="alert"><p>${esc(text('loadError'))}</p><button type="button" class="btn btn-secondary" data-hauling-retry>${esc(text('retry'))}</button></div>`;
        else if (!state.data) html = `<p class="hauling-status" role="status">${esc(text('loading'))}</p>`;
        else html = `${ranks()}${controls()}<section aria-label="${esc(text('contractsAt'))}">${table()}</section><p class="hauling-note">${esc(text('cargoNote'))}</p>
            <p class="hauling-sources">${esc(text('sourceGame', { version: state.data.version }))}<br>${esc(text('sourceNote'))}</p>`;
        root.innerHTML = html;
        if (focusId) (root.querySelector(focusId))?.focus();
    }

    async function load() {
        draw();
        try {
            const response = await fetch(DATA_URL, { cache: 'no-cache' });
            if (!response.ok) throw new Error(String(response.status));
            state.data = await response.json();
        } catch (_error) { state.error = true; }
        draw();
    }

    function render() {
        root = document.getElementById('hauling-app');
        if (!root || started) return;
        started = true;
        root.addEventListener('click', (event) => {
            const target = event.target.closest('button'); if (!target || !root.contains(target)) return;
            if (target.hasAttribute('data-hauling-retry')) { state.error = false; load(); return; }
            if (target.hasAttribute('data-hauling-more')) { const before = state.limit; state.limit += PAGE; draw(`.hauling-table tbody tr:nth-child(${before + 1}) th`); return; }
            if (target.hasAttribute('data-hauling-rank')) { const value = target.getAttribute('data-hauling-rank'); state.rank = state.rank === value ? '' : value; state.limit = PAGE; draw(`[data-hauling-rank="${value}"]`); }
        });
        root.addEventListener('change', (event) => {
            if (event.target.id === 'hauling-missing') { state.includeMissing = event.target.checked; state.limit = PAGE; draw('#hauling-missing'); return; }
            const map = { 'hauling-by': 'by', 'hauling-kind': 'kind', 'hauling-rank': 'rank' };
            const key = map[event.target.id]; if (!key) return;
            state[key] = event.target.value; state.limit = PAGE; draw(`#${event.target.id}`);
        });
        window.VOLT_I18N?.onChange?.(() => draw());
        load();
    }

    window.VOLT_HAULING = { render };
})();
