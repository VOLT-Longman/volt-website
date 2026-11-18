/**
 * 개인 장비 안내 — 개인 무기와 방어구를 견주고, 색상·한정판 변종과 판매처를 보여 준다.
 * - 수치: /data/gear/weapons.json, /data/gear/armor.json (출처: 게임 파일, scripts/gear/build-gear-data.mjs)
 * - 판매처·가격: /api/uex/loadout-prices (출처 UEX). 받지 못해도 수치는 그대로 보인다.
 * 변종은 수치가 완전히 같은 것끼리 한 묶음이다. 가격은 변종마다 다르므로 묶음 안에서 가장 싼 것을 대표로 보여 준다.
 * 값은 게임 파일 그대로이며 게임 안에서 실측한 값이 아니다.
 */
(function () {
    'use strict';
    const DATA = { weapon: '/data/gear/weapons.json', armor: '/data/gear/armor.json' };
    // UEX 품목 분류: 개인 무기 18 / 팔 1 · 배낭 2 · 투구 3 · 다리 4 · 몸통 5 · 언더수트 24
    const PRICE_CATEGORIES = { weapon: [18], armor: [1, 2, 3, 4, 5, 24] };
    const KINDS = ['pistol', 'smg', 'rifle', 'lmg', 'hmg', 'shotgun', 'sniper', 'launcher', 'crossbow', 'tool'];
    const SLOTS = ['helmet', 'core', 'arms', 'legs', 'undersuit', 'backpack'];
    const CLASSES = ['light', 'medium', 'heavy'];
    const DAMAGE = ['physical', 'energy', 'distortion', 'thermal', 'biochemical', 'stun'];
    const PAGE = 60;
    const TEXT = {
        ko: {
            loading: '개인 장비 자료를 불러오는 중입니다…', loadError: '개인 장비 자료를 불러오지 못했습니다.', retry: '다시 시도',
            weapon: '무기', armor: '방어구', views: '장비 종류', search: '이름 검색 (변종 이름 포함)', searchLabel: '검색', all: '전체',
            kinds: '무기 종류', pistol: '권총', smg: '기관단총', rifle: '소총', lmg: '경기관총', hmg: '중기관총', shotgun: '산탄총', sniper: '저격소총', launcher: '발사기', crossbow: '석궁', tool: '도구',
            slot: '부위', helmet: '헬멧', core: '코어(몸통)', arms: '팔', legs: '다리', undersuit: '언더수트', backpack: '배낭', allSlots: '부위 전체',
            armorClass: '등급', light: '경장갑', medium: '중장갑', heavy: '중(重)장갑', allClasses: '등급 전체', noClass: '등급 없음',
            sort: '정렬', sortDefault: '기본', sortDps: '이론 DPS 높은 순', sortPrice: '최저가 낮은 순', sortCut: '피해 감소 높은 순', sortStore: '수납 큰 순',
            name: '이름', kind: '종류', damage: '피해/발', rate: '연사(분당)', dps: '이론 DPS', mag: '탄창', speed: '탄속', range: '사거리', price: '최저가',
            cut: '피해 감소', temp: '견디는 온도', rad: '방사선 용량', store: '수납', variantsCount: '변종 {count}종', oneVariant: '단일 품목',
            physical: '물리', energy: '에너지', distortion: '디스토션', thermal: '열', biochemical: '생화학', stun: '기절',
            pick: '장비를 고르면 상세 수치와 변종·판매처가 나옵니다.', noResult: '맞는 장비가 없습니다.', more: '{count}개 더 보기', count: '{count}묶음',
            modes: '발사 방식', mode: '방식', single: '단발', rapid: '연사', burst: '점사', charged: '충전', beam: '빔', sequence: '순차', other: '기타',
            pulls: '한 번 당겨 {shots}발 · 분당 {pulls}회', burstShots: '{count}점사', pellets: '산탄 {count}발', chargeTime: '충전 {time}초',
            basisSequence: '발사 순서의 대기 시간으로 계산한 값', basisAutomatic: '게임 파일 값', basisUpper: '최대 한도 — 장전·충전 동작 때문에 실제는 더 느릴 수 있음',
            basisTitle: '연사 값의 근거', ammo: '탄', dropLine: '{start}m부터 미터당 {per} 감소 (최저 {floor})', blast: '폭발 {dmg} · 반경 {radius}m',
            attachments: '부착물 자리', optics: '조준경', barrel: '총열', under: '하부', upTo: 'S{size}까지', mass: '무게', maker: '제조사', size: '크기',
            guns: '무기 자리', mags: '탄창 자리', radRate: '방사선 해소율', perSecond: '/초',
            variants: '변종과 판매처', variantName: '변종', shops: '판매처', cheapest: '최저가', noShop: '판매처 정보 없음', shopsCount: '{count}곳',
            variantsNote: '아래 변종은 수치가 모두 같습니다. 판매처와 가격만 다릅니다.', priceLoading: '가격 확인 중', priceFailed: '가격을 불러오지 못했습니다',
            noShopNote: '판매처 정보가 없다고 해서 얻을 수 없다는 뜻은 아닙니다. 전리품·보상으로만 얻는 품목일 수 있습니다.',
            dpsNote: '이론 DPS = 피해 × 산탄 수 × 연사 ÷ 60. 재장전·반동·거리 감소를 뺀 값입니다.',
            sourceGame: '수치: Star Citizen 게임 파일 {version}', sourcePrice: '판매처·가격: UEX', sourceNote: '게임 파일에 적힌 값이며 게임 안에서 실측한 값이 아닙니다. UEX와 수치가 다르면 게임 파일 값을 따릅니다.',
            uec: 'aUEC', unknown: '—',
        },
        en: {
            loading: 'Loading personal gear…', loadError: 'Personal gear data could not be loaded.', retry: 'Retry',
            weapon: 'Weapons', armor: 'Armor', views: 'Gear type', search: 'Search by name (variants included)', searchLabel: 'Search', all: 'All',
            kinds: 'Weapon type', pistol: 'Pistol', smg: 'SMG', rifle: 'Rifle', lmg: 'LMG', hmg: 'HMG', shotgun: 'Shotgun', sniper: 'Sniper', launcher: 'Launcher', crossbow: 'Crossbow', tool: 'Tool',
            slot: 'Slot', helmet: 'Helmet', core: 'Core', arms: 'Arms', legs: 'Legs', undersuit: 'Undersuit', backpack: 'Backpack', allSlots: 'All slots',
            armorClass: 'Class', light: 'Light', medium: 'Medium', heavy: 'Heavy', allClasses: 'All classes', noClass: 'No class',
            sort: 'Sort', sortDefault: 'Default', sortDps: 'Highest theoretical DPS', sortPrice: 'Lowest price', sortCut: 'Highest damage reduction', sortStore: 'Largest storage',
            name: 'Name', kind: 'Type', damage: 'Damage/shot', rate: 'Rate (rpm)', dps: 'Theoretical DPS', mag: 'Magazine', speed: 'Velocity', range: 'Range', price: 'Lowest price',
            cut: 'Damage reduction', temp: 'Temperature range', rad: 'Radiation capacity', store: 'Storage', variantsCount: '{count} variants', oneVariant: 'Single item',
            physical: 'Physical', energy: 'Energy', distortion: 'Distortion', thermal: 'Thermal', biochemical: 'Biochemical', stun: 'Stun',
            pick: 'Pick an item to see its stats, variants and shops.', noResult: 'No gear matches.', more: 'Show {count} more', count: '{count} groups',
            modes: 'Fire modes', mode: 'Mode', single: 'Single', rapid: 'Auto', burst: 'Burst', charged: 'Charged', beam: 'Beam', sequence: 'Sequence', other: 'Other',
            pulls: '{shots} shots per pull · {pulls} pulls/min', burstShots: '{count}-round burst', pellets: '{count} pellets', chargeTime: '{time} s charge',
            basisSequence: 'Computed from the delays in the firing sequence', basisAutomatic: 'Game file value', basisUpper: 'Upper bound — reload or charge animations can make it slower',
            basisTitle: 'Basis of the rate', ammo: 'Ammo', dropLine: 'Drops {per} per metre from {start} m (floor {floor})', blast: 'Blast {dmg} · radius {radius} m',
            attachments: 'Attachment slots', optics: 'Optics', barrel: 'Barrel', under: 'Underbarrel', upTo: 'up to S{size}', mass: 'Mass', maker: 'Maker', size: 'Size',
            guns: 'Weapon slots', mags: 'Magazine slots', radRate: 'Radiation scrub rate', perSecond: '/s',
            variants: 'Variants and shops', variantName: 'Variant', shops: 'Shops', cheapest: 'Lowest price', noShop: 'No shop data', shopsCount: '{count} shops',
            variantsNote: 'These variants have identical stats. Only shops and prices differ.', priceLoading: 'Checking prices', priceFailed: 'Prices could not be loaded',
            noShopNote: 'No shop data does not mean an item cannot be obtained; it may be loot or a reward only.',
            dpsNote: 'Theoretical DPS = damage × pellets × rate ÷ 60. Reloads, recoil and range drop-off are not included.',
            sourceGame: 'Stats: Star Citizen game files {version}', sourcePrice: 'Shops and prices: UEX', sourceNote: 'These are the values written in the game files, not measured in game. Where UEX differs, the game file value is used.',
            uec: 'aUEC', unknown: '—',
        },
    };
    const state = { view: 'weapon', data: {}, error: {}, loading: {}, query: '', kind: '', slot: '', cls: '', sort: '', selected: { weapon: '', armor: '' }, limit: PAGE, prices: {}, priceState: {} };
    let root = null;
    let started = false;

    const lang = () => (window.VOLT_I18N?.getLang?.() === 'en' ? 'en' : 'ko');
    const text = (key, values) => String(TEXT[lang()][key] ?? TEXT.ko[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values?.[name] ?? '');
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const label = (name) => (lang() === 'ko' && name?.ko ? name.ko : name?.en || '');
    const num = (value, digits = 0) => (Number(value) || 0).toLocaleString(lang() === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: digits });
    const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const variantName = (variant) => (lang() === 'ko' && variant[2] ? variant[2] : variant[1]);

    // ---- 수치 ---------------------------------------------------------------
    const totalDamage = (damage) => Object.values(damage || {}).reduce((sum, value) => sum + value, 0);
    // 대표 발사 방식: 연사가 가장 높은 것. 빔은 초당 피해를 그대로 쓴다.
    function bestMode(group) {
        const modes = (group.modes || []).filter((mode) => mode.rpm || mode.beam);
        return modes.sort((a, b) => (b.rpm || 0) - (a.rpm || 0))[0] || null;
    }
    function dpsOf(group) {
        const mode = bestMode(group); if (!mode) return 0;
        if (mode.beam) return totalDamage(mode.beam);
        return totalDamage(group.ammo?.dmg) * (mode.pellets || 1) * (mode.rpm || 0) / 60;
    }
    const cutOf = (group) => group.cut?.[0] ?? -1;

    // ---- 가격 ---------------------------------------------------------------
    function shopsOf(variant) {
        const table = state.prices[state.view]; if (!table) return null;
        return table.byUuid.get(String(variant[0]).toLowerCase()) || table.byName.get(norm(variant[1])) || null;
    }
    function cheapest(group) {
        let best = null;
        for (const variant of group.variants) for (const shop of shopsOf(variant) || []) if (!best || shop.price < best.price) best = shop;
        return best;
    }
    function priceCell(group) {
        const status = state.priceState[state.view];
        if (status === 'loading') return `<span class="gear-muted">${esc(text('priceLoading'))}</span>`;
        const shop = cheapest(group);
        return shop ? `<strong>${esc(num(shop.price))}</strong> <small>${esc(text('uec'))}</small>` : `<span class="gear-muted">${esc(text('noShop'))}</span>`;
    }
    async function loadPrices(view) {
        if (state.priceState[view]) return;
        state.priceState[view] = 'loading';
        const byUuid = new Map(); const byName = new Map(); let failed = 0;
        await Promise.all(PRICE_CATEGORIES[view].map(async (category) => {
            try {
                const response = await fetch(`/api/uex/loadout-prices?category=${category}`, { headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error(String(response.status));
                const payload = await response.json();
                for (const [uuid, shops] of Object.entries(payload.data || {})) byUuid.set(uuid.toLowerCase(), shops);
                for (const item of payload.byName || []) byName.set(norm(item.name), item.shops);
            } catch (_error) { failed += 1; }
        }));
        state.prices[view] = { byUuid, byName };
        state.priceState[view] = failed === PRICE_CATEGORIES[view].length ? 'failed' : 'ready';
        if (state.view === view) draw();
    }

    // ---- 목록 ---------------------------------------------------------------
    function filtered() {
        const groups = state.data[state.view]?.groups || [];
        const query = state.query.trim().toLowerCase();
        const list = groups.filter((group) => {
            if (state.view === 'weapon' && state.kind && group.kind !== state.kind) return false;
            if (state.view === 'armor' && state.slot && group.slot !== state.slot) return false;
            if (state.view === 'armor' && state.cls && (state.cls === 'none' ? Boolean(group.cls) : group.cls !== state.cls)) return false;
            if (!query) return true;
            return `${group.name.ko || ''} ${group.name.en}`.toLowerCase().includes(query) || group.variants.some((variant) => `${variant[2] || ''} ${variant[1]}`.toLowerCase().includes(query));
        });
        if (state.sort === 'dps') list.sort((a, b) => dpsOf(b) - dpsOf(a));
        else if (state.sort === 'cut') list.sort((a, b) => cutOf(b) - cutOf(a));
        else if (state.sort === 'store') list.sort((a, b) => (b.store || 0) - (a.store || 0));
        else if (state.sort === 'price') list.sort((a, b) => (cheapest(a)?.price ?? Infinity) - (cheapest(b)?.price ?? Infinity));
        return list;
    }
    const option = (value, name, current) => `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(name)}</option>`;
    function toolbar() {
        const tab = (view) => `<button type="button" role="tab" class="gear-tab${state.view === view ? ' is-active' : ''}" aria-selected="${state.view === view}" data-gear-view="${view}">${esc(text(view))}</button>`;
        const weaponView = state.view === 'weapon';
        const sorts = weaponView ? [['', 'sortDefault'], ['dps', 'sortDps'], ['price', 'sortPrice']] : [['', 'sortDefault'], ['cut', 'sortCut'], ['store', 'sortStore'], ['price', 'sortPrice']];
        return `<div class="gear-toolbar">
            <div class="gear-tabs" role="tablist" aria-label="${esc(text('views'))}">${tab('weapon')}${tab('armor')}</div>
            <label class="gear-search"><span class="visually-hidden">${esc(text('searchLabel'))}</span><input type="search" id="gear-search" value="${esc(state.query)}" placeholder="${esc(text('search'))}" autocomplete="off"></label>
            ${weaponView ? `<label class="gear-select"><span>${esc(text('kinds'))}</span><select id="gear-kind">${option('', text('all'), state.kind)}${KINDS.map((kind) => option(kind, text(kind), state.kind)).join('')}</select></label>`
                : `<label class="gear-select"><span>${esc(text('slot'))}</span><select id="gear-slot">${option('', text('allSlots'), state.slot)}${SLOTS.map((slot) => option(slot, text(slot), state.slot)).join('')}</select></label>
                   <label class="gear-select"><span>${esc(text('armorClass'))}</span><select id="gear-class">${option('', text('allClasses'), state.cls)}${CLASSES.map((cls) => option(cls, text(cls), state.cls)).join('')}${option('none', text('noClass'), state.cls)}</select></label>`}
            <label class="gear-select"><span>${esc(text('sort'))}</span><select id="gear-sort">${sorts.map(([value, key]) => option(value, text(key), state.sort)).join('')}</select></label>
        </div>`;
    }
    const variantsTag = (group) => `<small class="gear-muted">${esc(group.variants.length > 1 ? text('variantsCount', { count: group.variants.length }) : text('oneVariant'))}</small>`;
    const rowButton = (group) => `<button type="button" class="gear-rowbtn" data-gear-pick="${esc(group.id)}" aria-pressed="${state.selected[state.view] === group.id}">${esc(label(group.name))}</button> ${variantsTag(group)}`;
    function rateCell(mode) {
        if (!mode) return text('unknown');
        if (mode.beam) return esc(text('beam'));
        return `${mode.basis === 'upperBound' ? '≤ ' : ''}${esc(num(mode.rpm))}`;
    }
    function weaponRows(list) {
        return `<thead><tr><th scope="col">${esc(text('name'))}</th><th scope="col">${esc(text('kind'))}</th><th scope="col" class="is-num">${esc(text('damage'))}</th><th scope="col" class="is-num">${esc(text('rate'))}</th><th scope="col" class="is-num">${esc(text('dps'))}</th><th scope="col" class="is-num">${esc(text('mag'))}</th><th scope="col" class="is-num">${esc(text('speed'))}</th><th scope="col" class="is-num">${esc(text('price'))}</th></tr></thead>
            <tbody>${list.map((group) => { const mode = bestMode(group); const damage = totalDamage(group.ammo?.dmg); const dps = dpsOf(group); return `<tr class="${state.selected.weapon === group.id ? 'is-selected' : ''}">
                <th scope="row">${rowButton(group)}</th>
                <td><span class="gear-tag">${esc(text(group.kind))}</span></td>
                <td class="is-num">${damage ? `${esc(num(damage, 1))}${mode?.pellets ? ` × ${esc(mode.pellets)}` : ''}` : esc(text('unknown'))}</td>
                <td class="is-num">${rateCell(mode)}</td>
                <td class="is-num">${dps ? `${mode?.basis === 'upperBound' ? '≤ ' : ''}${esc(num(dps))}` : esc(text('unknown'))}</td>
                <td class="is-num">${group.mag ? esc(num(group.mag)) : esc(text('unknown'))}</td>
                <td class="is-num">${group.ammo?.speed ? `${esc(num(group.ammo.speed))} m/s` : esc(text('unknown'))}</td>
                <td class="is-num">${priceCell(group)}</td></tr>`; }).join('')}</tbody>`;
    }
    function armorRows(list) {
        return `<thead><tr><th scope="col">${esc(text('name'))}</th><th scope="col">${esc(text('slot'))}</th><th scope="col">${esc(text('armorClass'))}</th><th scope="col" class="is-num">${esc(text('cut'))}</th><th scope="col" class="is-num">${esc(text('temp'))}</th><th scope="col" class="is-num">${esc(text('store'))}</th><th scope="col" class="is-num">${esc(text('price'))}</th></tr></thead>
            <tbody>${list.map((group) => `<tr class="${state.selected.armor === group.id ? 'is-selected' : ''}">
                <th scope="row">${rowButton(group)}</th>
                <td><span class="gear-tag">${esc(text(group.slot))}</span></td>
                <td>${group.cls ? esc(text(group.cls)) : `<span class="gear-muted">${esc(text('unknown'))}</span>`}</td>
                <td class="is-num">${group.cut ? `${esc(num(group.cut[0]))}%` : esc(text('unknown'))}</td>
                <td class="is-num">${group.temp ? `${esc(num(group.temp[0]))} ~ ${esc(num(group.temp[1]))}°C` : esc(text('unknown'))}</td>
                <td class="is-num">${group.store ? `${esc(num(group.store / 1000, 1))}K µSCU` : esc(text('unknown'))}</td>
                <td class="is-num">${priceCell(group)}</td></tr>`).join('')}</tbody>`;
    }
    function list() {
        const rows = filtered();
        if (!rows.length) return `<p class="gear-empty">${esc(text('noResult'))}</p>`;
        const shown = rows.slice(0, state.limit);
        return `<p class="gear-count" role="status">${esc(text('count', { count: num(rows.length) }))}</p>
            <div class="gear-tablewrap" tabindex="0" role="region" aria-label="${esc(text(state.view))}"><table class="gear-table">${state.view === 'weapon' ? weaponRows(shown) : armorRows(shown)}</table></div>
            ${rows.length > shown.length ? `<button type="button" class="btn btn-secondary gear-more" data-gear-more>${esc(text('more', { count: num(Math.min(PAGE, rows.length - shown.length)) }))}</button>` : ''}`;
    }

    // ---- 상세 ---------------------------------------------------------------
    const stat = (name, value) => `<div><dt>${esc(name)}</dt><dd>${value}</dd></div>`;
    const damageLine = (damage) => DAMAGE.filter((key) => damage?.[key]).map((key) => `${esc(text(key))} ${esc(num(damage[key], 2))}`).join(' · ');
    const BASIS = { sequence: 'basisSequence', automatic: 'basisAutomatic', upperBound: 'basisUpper' };
    function weaponDetail(group) {
        const ammo = group.ammo || {};
        const modes = (group.modes || []).map((mode) => `<tr><th scope="row">${esc(text(mode.k))}${mode.name ? ` <small class="gear-muted">${esc(mode.name)}</small>` : ''}</th>
            <td class="is-num">${mode.beam ? esc(damageLine(mode.beam)) : rateCell(mode)}</td>
            <td>${[mode.pulls ? text('pulls', { shots: mode.shots, pulls: mode.pulls }) : '', mode.burst ? text('burstShots', { count: mode.burst }) : '', mode.pellets ? text('pellets', { count: mode.pellets }) : '', mode.charge?.time ? text('chargeTime', { time: num(mode.charge.time, 2) }) : ''].filter(Boolean).map(esc).join(' · ')}</td>
            <td><small>${mode.basis ? esc(text(BASIS[mode.basis])) : ''}</small></td></tr>`).join('');
        const slots = ['optics', 'barrel', 'under'].filter((key) => group.slots?.[key]).map((key) => stat(text(key), esc(text('upTo', { size: group.slots[key] })))).join('');
        return `<dl class="gear-stats">
                ${stat(text('kind'), esc(text(group.kind)))}${group.mfr ? stat(text('maker'), esc(group.mfr)) : ''}${stat(text('size'), `S${esc(group.size ?? '?')}`)}${group.mass ? stat(text('mass'), `${esc(num(group.mass, 2))} kg`) : ''}
                ${group.mag ? stat(text('mag'), esc(num(group.mag))) : ''}${ammo.dmg ? stat(text('damage'), damageLine(ammo.dmg)) : ''}${ammo.speed ? stat(text('speed'), `${esc(num(ammo.speed))} m/s`) : ''}${ammo.range ? stat(text('range'), `${esc(num(ammo.range))} m`) : ''}
                ${dpsOf(group) ? stat(text('dps'), `${bestMode(group)?.basis === 'upperBound' ? '≤ ' : ''}${esc(num(dpsOf(group)))}`) : ''}
            </dl>
            ${ammo.drop && (ammo.drop[1] || ammo.drop[0]) ? `<p class="gear-note">${esc(text('dropLine', { start: num(ammo.drop[0], 1), per: num(ammo.drop[1], 3), floor: num(ammo.drop[2], 2) }))}</p>` : ''}
            ${ammo.blast ? `<p class="gear-note">${esc(text('blast', { dmg: damageLine(ammo.blast.dmg), radius: num(ammo.blast.radius, 1) }))}</p>` : ''}
            ${modes ? `<section><h4>${esc(text('modes'))}</h4><div class="gear-tablewrap"><table class="gear-table"><thead><tr><th scope="col">${esc(text('mode'))}</th><th scope="col" class="is-num">${esc(text('rate'))}</th><th scope="col"></th><th scope="col">${esc(text('basisTitle'))}</th></tr></thead><tbody>${modes}</tbody></table></div></section>` : ''}
            ${slots ? `<section><h4>${esc(text('attachments'))}</h4><dl class="gear-stats">${slots}</dl></section>` : ''}
            <p class="gear-note">${esc(text('dpsNote'))}</p>`;
    }
    function armorDetail(group) {
        return `<dl class="gear-stats">
                ${stat(text('slot'), esc(text(group.slot)))}${group.cls ? stat(text('armorClass'), esc(text(group.cls))) : ''}${group.mfr ? stat(text('maker'), esc(group.mfr)) : ''}${group.mass ? stat(text('mass'), `${esc(num(group.mass, 2))} kg`) : ''}
                ${group.temp ? stat(text('temp'), `${esc(num(group.temp[0]))} ~ ${esc(num(group.temp[1]))}°C`) : ''}${group.rad ? stat(text('rad'), esc(num(group.rad[0]))) + stat(text('radRate'), `${esc(num(group.rad[1], 1))}${esc(text('perSecond'))}`) : ''}
                ${group.store ? stat(text('store'), `${esc(num(group.store))} µSCU`) : ''}${group.guns ? stat(text('guns'), esc(num(group.guns))) : ''}${group.mags ? stat(text('mags'), esc(num(group.mags))) : ''}
            </dl>
            ${group.cut ? `<section><h4>${esc(text('cut'))}</h4><dl class="gear-stats">${DAMAGE.map((key, index) => stat(text(key), `${esc(num(group.cut[index]))}%`)).join('')}</dl></section>` : ''}`;
    }
    function variants(group) {
        const status = state.priceState[state.view];
        const rows = group.variants.map((variant) => {
            const shops = shopsOf(variant) || []; const best = shops[0];
            return `<tr><th scope="row">${esc(variantName(variant))}</th>
                <td class="is-num">${status === 'loading' ? `<span class="gear-muted">${esc(text('priceLoading'))}</span>` : best ? `<strong>${esc(num(best.price))}</strong> <small>${esc(text('uec'))}</small>` : `<span class="gear-muted">${esc(text('noShop'))}</span>`}</td>
                <td>${best ? `${esc([best.shop, best.place, best.system].filter(Boolean).join(' · '))}${shops.length > 1 ? ` <small class="gear-muted">${esc(text('shopsCount', { count: shops.length }))}</small>` : ''}` : ''}</td></tr>`;
        }).join('');
        return `<section class="gear-variants"><h4>${esc(text('variants'))} <small class="gear-muted">${esc(group.variants.length > 1 ? text('variantsCount', { count: group.variants.length }) : text('oneVariant'))}</small></h4>
            ${group.variants.length > 1 ? `<p class="gear-note">${esc(text('variantsNote'))}</p>` : ''}
            <div class="gear-tablewrap" tabindex="0" role="region" aria-label="${esc(text('variants'))}"><table class="gear-table"><thead><tr><th scope="col">${esc(text('variantName'))}</th><th scope="col" class="is-num">${esc(text('cheapest'))}</th><th scope="col">${esc(text('shops'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
            <p class="gear-note">${esc(status === 'failed' ? text('priceFailed') : text('noShopNote'))}</p></section>`;
    }
    function detail() {
        const group = (state.data[state.view]?.groups || []).find((item) => item.id === state.selected[state.view]);
        if (!group) return `<p class="gear-hint">${esc(text('pick'))}</p>`;
        return `<section class="gear-detail" aria-labelledby="gear-detail-title">
            <header class="gear-detail-head"><h3 id="gear-detail-title" tabindex="-1">${esc(label(group.name))}</h3>${lang() === 'ko' && group.name.ko ? `<span class="gear-muted">${esc(group.name.en)}</span>` : ''}</header>
            ${state.view === 'weapon' ? weaponDetail(group) : armorDetail(group)}
            ${variants(group)}
        </section>`;
    }

    function draw(focus) {
        if (!root) return;
        const active = document.activeElement?.id; const caret = active === 'gear-search' ? document.activeElement.selectionStart : null;
        let html;
        // 화면 전체를 이 한 곳에서 다시 그린다. 모든 동적 값은 esc()를 거친다.
        if (state.error[state.view]) html = `${toolbar()}<div class="gear-status" role="alert"><p>${esc(text('loadError'))}</p><button type="button" class="btn btn-secondary" data-gear-retry>${esc(text('retry'))}</button></div>`;
        else if (!state.data[state.view]) html = `${toolbar()}<p class="gear-status" role="status">${esc(text('loading'))}</p>`;
        else html = `${toolbar()}<div class="gear-columns"><div class="gear-list">${list()}</div><div class="gear-side">${detail()}</div></div>
            <p class="gear-sources">${esc(text('sourceGame', { version: state.data[state.view].version }))} · ${esc(text('sourcePrice'))}<br>${esc(text('sourceNote'))}</p>`;
        root.innerHTML = html;
        const target = focus ? root.querySelector(focus) : (active && /^gear-/.test(active) ? document.getElementById(active) : null);
        target?.focus();
        if (caret !== null && target?.id === 'gear-search') target.setSelectionRange(caret, caret);
    }

    async function load(view) {
        if (state.data[view] || state.loading[view]) return;
        state.loading[view] = true; state.error[view] = false;
        draw();
        try {
            const response = await fetch(DATA[view], { cache: 'no-cache' });
            if (!response.ok) throw new Error(String(response.status));
            state.data[view] = await response.json();
        } catch (_error) { state.error[view] = true; }
        state.loading[view] = false;
        if (state.view === view) draw();
        if (state.data[view]) loadPrices(view);
    }

    function render() {
        root = document.getElementById('gear-app');
        if (!root || started) return;
        started = true;
        root.addEventListener('click', (event) => {
            const target = event.target.closest('button'); if (!target || !root.contains(target)) return;
            if (target.hasAttribute('data-gear-retry')) { load(state.view); return; }
            if (target.dataset.gearView) { state.view = target.dataset.gearView; state.query = ''; state.sort = ''; state.limit = PAGE; draw(`[data-gear-view="${state.view}"]`); load(state.view); return; }
            if (target.hasAttribute('data-gear-more')) { const before = state.limit; state.limit += PAGE; draw(`.gear-list tbody tr:nth-child(${before + 1}) .gear-rowbtn`); return; }
            if (target.dataset.gearPick) { state.selected[state.view] = target.dataset.gearPick; draw('#gear-detail-title'); }
        });
        root.addEventListener('input', (event) => { if (event.target.id === 'gear-search') { state.query = event.target.value; state.limit = PAGE; draw(); } });
        root.addEventListener('change', (event) => {
            const key = { 'gear-kind': 'kind', 'gear-slot': 'slot', 'gear-class': 'cls', 'gear-sort': 'sort' }[event.target.id]; if (!key) return;
            state[key] = event.target.value; state.limit = PAGE; draw(`#${event.target.id}`);
        });
        window.VOLT_I18N?.onChange?.(() => draw());
        load(state.view);
    }

    window.VOLT_GEAR = { render };
})();
