/**
 * 개인 장비 안내 — 개인 무기와 방어구를 견주고, 색상·한정판 변종과 판매처를 보여 준다.
 * - 수치: /data/gear/weapons.json, /data/gear/armor.json (출처: 게임 파일, scripts/gear/build-gear-data.mjs)
 * - 판매처·가격: /api/uex/loadout-prices (출처 UEX). 받지 못해도 수치는 그대로 보인다.
 * 변종은 수치가 완전히 같은 것끼리 한 묶음이다. 가격은 변종마다 다르므로 묶음 안에서 가장 싼 것을 대표로 보여 준다.
 * 값은 게임 파일 그대로이며 게임 안에서 실측한 값이 아니다.
 */
(function () {
    'use strict';
    const DATA = { weapon: '/data/gear/weapons.json', armor: '/data/gear/armor.json', body: '/data/gear/body.json', icons: '/data/gear/icons.json' };
    const CART_KEY = 'volt.gear.cart.v1';
    const FIT_KEY = 'volt.gear.fit.v1';
    const BODY_PARTS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
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
            fit: '착용 시험', cart: '장바구니', cartCount: '장바구니 {count}', wear: '착용 시험에 입히기', shootWith: '이 무기로 쏴 보기', addCart: '담기', inCart: '담김 {count}',
            fitIntro: '방어구를 부위별로 입히고 무기를 골라, 한 발에 얼마나 피해가 들어가는지 봅니다.', mannequin: '착용 상태', wearing: '입힌 장비', attacker: '쏘는 무기', none: '없음', noWeapon: '무기를 고르세요',
            distance: '거리 (m)', fireMode: '발사 방식', head: '머리', torso: '몸통', leftArm: '왼팔', rightArm: '오른팔', leftLeg: '왼다리', rightLeg: '오른다리',
            bodyPart: '부위', cover: '덮은 장비', bare: '맨몸', perShot: '한 발 피해', shotsToDown: '쓰러질 때까지', shots: '{count}발', timeToDown: '걸리는 시간', seconds: '{time}초', partHealth: '부위 체력',
            reduction: '받는 배율', takesAll: '피해 없음', poolLine: '전체 체력 {pool} 기준', clearFit: '모두 벗기기', pickSlot: '{slot} 고르기',
            fitNote: '계산 방식: 한 발 피해 × 부위 배율 × 방어구의 피해 종류별 감소. 방어구가 덮지 않은 부위는 맨몸 배율을 씁니다. 방어구 조각이 없고 언더수트만 있으면 언더수트 값을 씁니다.',
            fitLimits: '반영하지 않은 것: 방어구 내구도 저하, 출혈, 기절, 관통, 탄퍼짐, 빗나감. 게임 파일 값으로 계산한 추정이며 게임 안에서 확인한 값이 아닙니다.',
            upperNote: '이 발사 방식의 연사는 최대 한도라, 실제 걸리는 시간은 더 길 수 있습니다.', summaryCut: '물리 피해 감소', summaryTemp: '견디는 온도', summaryStore: '수납 합계', summaryMass: '방어구 무게',
            cartEmpty: '담은 장비가 없습니다. 무기나 방어구의 변종 목록에서 「담기」를 누르세요.', item: '품목', qty: '수량', unitPrice: '단가', subtotal: '소계', total: '합계', remove: '빼기', clearCart: '장바구니 비우기',
            byShop: '상점별로 살 것', unknownPrice: '가격 미확인 {count}종은 합계에 넣지 않았습니다.', cartNote: '가격은 UEX 기준 최저가입니다. 장바구니는 이 브라우저에만 저장됩니다.', decrease: '수량 줄이기', increase: '수량 늘리기',
            iconCredit: '무기 아이콘 © Cloud Imperium Games',
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
            fit: 'Fitting test', cart: 'Cart', cartCount: 'Cart {count}', wear: 'Put on the mannequin', shootWith: 'Shoot with this weapon', addCart: 'Add', inCart: 'In cart {count}',
            fitIntro: 'Dress the mannequin slot by slot, pick a weapon and see how much damage one shot does.', mannequin: 'Fitting', wearing: 'Equipped', attacker: 'Attacking weapon', none: 'None', noWeapon: 'Pick a weapon',
            distance: 'Distance (m)', fireMode: 'Fire mode', head: 'Head', torso: 'Torso', leftArm: 'Left arm', rightArm: 'Right arm', leftLeg: 'Left leg', rightLeg: 'Right leg',
            bodyPart: 'Body part', cover: 'Covered by', bare: 'Bare', perShot: 'Damage per shot', shotsToDown: 'Shots to down', shots: '{count} shots', timeToDown: 'Time', seconds: '{time} s', partHealth: 'Part health',
            reduction: 'Multiplier', takesAll: 'No damage', poolLine: 'Against a health pool of {pool}', clearFit: 'Remove everything', pickSlot: 'Pick {slot}',
            fitNote: 'How it is computed: damage per shot × body part multiplier × the armor reduction for each damage type. Uncovered parts use the bare multiplier. With no armor piece but an undersuit, the undersuit values apply.',
            fitLimits: 'Not included: armor wear, bleeding, stun, penetration, spread and misses. This is an estimate from game file values, not confirmed in game.',
            upperNote: 'The rate of this fire mode is an upper bound, so the real time can be longer.', summaryCut: 'Physical reduction', summaryTemp: 'Temperature range', summaryStore: 'Total storage', summaryMass: 'Armor mass',
            cartEmpty: 'Nothing in the cart. Use “Add” in the variant list of a weapon or armor piece.', item: 'Item', qty: 'Qty', unitPrice: 'Unit price', subtotal: 'Subtotal', total: 'Total', remove: 'Remove', clearCart: 'Empty the cart',
            byShop: 'What to buy at each shop', unknownPrice: '{count} items without a known price are left out of the total.', cartNote: 'Prices are the lowest known on UEX. The cart is stored in this browser only.', decrease: 'Decrease quantity', increase: 'Increase quantity',
            iconCredit: 'Weapon icons © Cloud Imperium Games',
        },
    };
    const state = { view: 'weapon', data: {}, error: {}, loading: {}, query: '', kind: '', slot: '', cls: '', sort: '', selected: { weapon: '', armor: '' }, limit: PAGE, prices: {}, priceState: {}, fit: { wear: {}, weapon: '', mode: 0, distance: 10 }, cart: {} };
    let root = null;
    let started = false;

    const lang = () => (window.VOLT_I18N?.getLang?.() === 'en' ? 'en' : 'ko');
    const text = (key, values) => String(TEXT[lang()][key] ?? TEXT.ko[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values?.[name] ?? '');
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const label = (name) => (lang() === 'ko' && name?.ko ? name.ko : name?.en || '');
    const num = (value, digits = 0) => (Number(value) || 0).toLocaleString(lang() === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: digits });
    const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const variantName = (variant) => (lang() === 'ko' && variant[2] ? variant[2] : variant[1]);

    function readStored(key, fallback) { try { const value = JSON.parse(window.localStorage.getItem(key) || 'null'); return value && typeof value === 'object' ? value : fallback; } catch (_error) { return fallback; } }
    function store(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_error) { /* 저장을 못 해도 화면은 동작한다 */ } }
    const groupsOf = (view) => state.data[view]?.groups || [];
    const findGroup = (view, id) => groupsOf(view).find((group) => group.id === id) || null;
    // 변종 고유번호 → { view, group, variant }
    function findVariant(uuid) {
        for (const view of ['weapon', 'armor']) for (const group of groupsOf(view)) { const variant = group.variants.find((item) => item[0] === uuid); if (variant) return { view, group, variant }; }
        return null;
    }
    const cartTotal = () => Object.values(state.cart).reduce((sum, count) => sum + count, 0);
    const iconOf = (group) => { const icon = state.data.icons?.icons?.[group.id]; return icon ? `<img class="gear-icon" src="/${esc(icon.file)}" width="${esc(icon.width)}" height="${esc(icon.height)}" alt="" loading="lazy" decoding="async">` : ''; };

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
    function shopsOf(variant, view = state.view) {
        const table = state.prices[view]; if (!table) return null;
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
        const tabs = `<div class="gear-tabs" role="tablist" aria-label="${esc(text('views'))}">${tab('weapon')}${tab('armor')}${tab('fit')}<button type="button" role="tab" class="gear-tab${state.view === 'cart' ? ' is-active' : ''}" aria-selected="${state.view === 'cart'}" data-gear-view="cart">${esc(cartTotal() ? text('cartCount', { count: cartTotal() }) : text('cart'))}</button></div>`;
        if (state.view === 'fit' || state.view === 'cart') return `<div class="gear-toolbar">${tabs}</div>`;
        const weaponView = state.view === 'weapon';
        const sorts = weaponView ? [['', 'sortDefault'], ['dps', 'sortDps'], ['price', 'sortPrice']] : [['', 'sortDefault'], ['cut', 'sortCut'], ['store', 'sortStore'], ['price', 'sortPrice']];
        return `<div class="gear-toolbar">
            ${tabs}
            <label class="gear-search"><span class="visually-hidden">${esc(text('searchLabel'))}</span><input type="search" id="gear-search" value="${esc(state.query)}" placeholder="${esc(text('search'))}" autocomplete="off"></label>
            ${weaponView ? `<label class="gear-select"><span>${esc(text('kinds'))}</span><select id="gear-kind">${option('', text('all'), state.kind)}${KINDS.map((kind) => option(kind, text(kind), state.kind)).join('')}</select></label>`
                : `<label class="gear-select"><span>${esc(text('slot'))}</span><select id="gear-slot">${option('', text('allSlots'), state.slot)}${SLOTS.map((slot) => option(slot, text(slot), state.slot)).join('')}</select></label>
                   <label class="gear-select"><span>${esc(text('armorClass'))}</span><select id="gear-class">${option('', text('allClasses'), state.cls)}${CLASSES.map((cls) => option(cls, text(cls), state.cls)).join('')}${option('none', text('noClass'), state.cls)}</select></label>`}
            <label class="gear-select"><span>${esc(text('sort'))}</span><select id="gear-sort">${sorts.map(([value, key]) => option(value, text(key), state.sort)).join('')}</select></label>
        </div>`;
    }
    const variantsTag = (group) => `<small class="gear-muted">${esc(group.variants.length > 1 ? text('variantsCount', { count: group.variants.length }) : text('oneVariant'))}</small>`;
    const rowButton = (group) => `${state.view === 'weapon' ? iconOf(group) : ''}<button type="button" class="gear-rowbtn" data-gear-pick="${esc(group.id)}" aria-pressed="${state.selected[state.view] === group.id}">${esc(label(group.name))}</button> ${variantsTag(group)}`;
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
                <td>${best ? `${esc([best.shop, best.place, best.system].filter(Boolean).join(' · '))}${shops.length > 1 ? ` <small class="gear-muted">${esc(text('shopsCount', { count: shops.length }))}</small>` : ''}` : ''}</td>
                <td class="is-num"><button type="button" class="gear-add" data-gear-add="${esc(variant[0])}" aria-label="${esc(variantName(variant))} ${esc(text('addCart'))}">${esc(state.cart[variant[0]] ? text('inCart', { count: state.cart[variant[0]] }) : text('addCart'))}</button></td></tr>`;
        }).join('');
        return `<section class="gear-variants"><h4>${esc(text('variants'))} <small class="gear-muted">${esc(group.variants.length > 1 ? text('variantsCount', { count: group.variants.length }) : text('oneVariant'))}</small></h4>
            ${group.variants.length > 1 ? `<p class="gear-note">${esc(text('variantsNote'))}</p>` : ''}
            <div class="gear-tablewrap" tabindex="0" role="region" aria-label="${esc(text('variants'))}"><table class="gear-table"><thead><tr><th scope="col">${esc(text('variantName'))}</th><th scope="col" class="is-num">${esc(text('cheapest'))}</th><th scope="col">${esc(text('shops'))}</th><th scope="col" class="is-num">${esc(text('cart'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
            <p class="gear-note">${esc(status === 'failed' ? text('priceFailed') : text('noShopNote'))}</p></section>`;
    }
    function detail() {
        const group = (state.data[state.view]?.groups || []).find((item) => item.id === state.selected[state.view]);
        if (!group) return `<p class="gear-hint">${esc(text('pick'))}</p>`;
        return `<section class="gear-detail" aria-labelledby="gear-detail-title">
            <header class="gear-detail-head"><h3 id="gear-detail-title" tabindex="-1">${esc(label(group.name))}</h3>${lang() === 'ko' && group.name.ko ? `<span class="gear-muted">${esc(group.name.en)}</span>` : ''}</header>
            <div class="gear-actions">${state.view === 'weapon' ? `${iconOf(group)}<button type="button" class="btn btn-secondary" data-gear-shoot="${esc(group.id)}">${esc(text('shootWith'))}</button>` : (group.slot ? `<button type="button" class="btn btn-secondary" data-gear-wear="${esc(group.id)}">${esc(text('wear'))}</button>` : '')}</div>
            ${state.view === 'weapon' ? weaponDetail(group) : armorDetail(group)}
            ${variants(group)}
        </section>`;
    }

    // ---- 착용 시험 -----------------------------------------------------------
    // 한 발 피해: 탄의 피해 종류별 값에 거리 감소를 먹인 뒤, 부위 배율과 방어구 감소를 곱한다.
    function shotDamage(weapon, mode, distance) {
        const damage = { ...(mode?.beam || weapon.ammo?.dmg || {}) };
        const drop = weapon.ammo?.drop; const main = Object.keys(damage)[0];
        if (!mode?.beam && drop && main && distance > drop[0]) damage[main] = Math.max(drop[2] || 0, damage[main] - drop[1] * (distance - drop[0]));
        return damage;
    }
    function coverOf(part) {
        const body = state.data.body; if (!body) return null;
        for (const slot of ['helmet', 'core', 'arms', 'legs']) { const group = findGroup('armor', state.fit.wear[slot]); if (group && body.covers[slot].includes(part)) return group; }
        const undersuit = findGroup('armor', state.fit.wear.undersuit);
        return undersuit && body.covers.undersuit.includes(part) ? undersuit : null;
    }
    function fitRows() {
        const body = state.data.body; const weapon = findGroup('weapon', state.fit.weapon);
        const modes = (weapon?.modes || []).filter((mode) => mode.rpm || mode.beam);
        const mode = modes[Math.min(state.fit.mode, modes.length - 1)] || null;
        const base = weapon ? shotDamage(weapon, mode, Number(state.fit.distance) || 0) : {};
        return BODY_PARTS.map((id) => {
            const part = body.parts.find((item) => item.id === id); const cover = coverOf(id);
            const raw = DAMAGE.reduce((sum, key) => sum + (base[key] || 0), 0) * (mode?.pellets || 1);
            const taken = DAMAGE.reduce((sum, key, index) => sum + (base[key] || 0) * (cover ? part.armored * (1 - (cover.cut?.[index] ?? 0) / 100) : part.naked), 0) * (mode?.pellets || 1);
            const hits = taken > 0 ? Math.ceil(body.pool / taken) : null;
            // 빔은 초당 피해라 발 수 대신 시간으로 보여 준다.
            const seconds = mode?.beam ? (taken > 0 ? body.pool / taken : null) : (hits && mode?.rpm ? (hits - 1) * 60 / mode.rpm : null);
            return { part, cover, raw, taken, hits, seconds, beam: Boolean(mode?.beam), mode };
        });
    }
    function mannequin(rows) {
        const level = (row) => (!state.fit.weapon || !row.taken ? 'idle' : row.beam ? (row.seconds <= 1 ? 'high' : row.seconds <= 3 ? 'mid' : 'low') : row.hits <= 2 ? 'high' : row.hits <= 5 ? 'mid' : 'low');
        const row = (id) => rows.find((item) => item.part.id === id);
        const shape = (id, element) => `<g class="gear-body-part is-${level(row(id))}${row(id).cover ? ' is-covered' : ''}">${element}<title>${esc(text(id))}</title></g>`;
        return `<svg class="gear-mannequin" viewBox="0 0 200 420" role="img" aria-label="${esc(text('mannequin'))}">
            ${shape('head', '<circle cx="100" cy="42" r="30"></circle>')}
            ${shape('torso', '<rect x="62" y="80" width="76" height="140" rx="16"></rect>')}
            ${shape('rightArm', '<rect x="22" y="84" width="30" height="150" rx="14"></rect>')}
            ${shape('leftArm', '<rect x="148" y="84" width="30" height="150" rx="14"></rect>')}
            ${shape('rightLeg', '<rect x="62" y="230" width="34" height="176" rx="14"></rect>')}
            ${shape('leftLeg', '<rect x="104" y="230" width="34" height="176" rx="14"></rect>')}
        </svg>`;
    }
    function fitView() {
        const body = state.data.body; const armor = state.data.armor; const weapons = state.data.weapon;
        if (!body || !armor || !weapons) return `<p class="gear-status" role="status">${esc(text('loading'))}</p>`;
        const rows = fitRows(); const weapon = findGroup('weapon', state.fit.weapon);
        const modes = (weapon?.modes || []).filter((mode) => mode.rpm || mode.beam); const mode = rows[0].mode;
        const slotSelect = (slot) => { const options = groupsOf('armor').filter((group) => group.slot === slot); const current = state.fit.wear[slot] || '';
            return `<label class="gear-select"><span>${esc(text(slot))}</span><select data-gear-slot="${slot}" aria-label="${esc(text('pickSlot', { slot: text(slot) }))}">${option('', text('none'), current)}${['light', 'medium', 'heavy', ''].map((cls) => { const list = options.filter((group) => (group.cls || '') === cls); return list.length ? `<optgroup label="${esc(cls ? text(cls) : text('noClass'))}">${list.map((group) => option(group.id, label(group.name), current)).join('')}</optgroup>` : ''; }).join('')}</select></label>`; };
        const worn = SLOTS.map((slot) => findGroup('armor', state.fit.wear[slot])).filter(Boolean);
        const temps = worn.filter((group) => group.temp); const stores = worn.reduce((sum, group) => sum + (group.store || 0), 0); const mass = worn.reduce((sum, group) => sum + (group.mass || 0), 0);
        const summary = worn.length ? `<dl class="gear-stats">
            ${temps.length ? stat(text('summaryTemp'), `${esc(num(Math.max(...temps.map((group) => group.temp[0]))))} ~ ${esc(num(Math.min(...temps.map((group) => group.temp[1]))))}°C`) : ''}
            ${stores ? stat(text('summaryStore'), `${esc(num(stores))} µSCU`) : ''}${mass ? stat(text('summaryMass'), `${esc(num(mass, 1))} kg`) : ''}</dl>` : '';
        const table = `<div class="gear-tablewrap" tabindex="0" role="region" aria-label="${esc(text('fit'))}"><table class="gear-table gear-fit-table">
            <thead><tr><th scope="col">${esc(text('bodyPart'))}</th><th scope="col">${esc(text('cover'))}</th><th scope="col" class="is-num">${esc(text('perShot'))}</th><th scope="col" class="is-num">${esc(text('reduction'))}</th><th scope="col" class="is-num">${esc(text('shotsToDown'))}</th><th scope="col" class="is-num">${esc(text('timeToDown'))}</th><th scope="col">${esc(text('partHealth'))}</th></tr></thead>
            <tbody>${rows.map((row) => `<tr><th scope="row">${esc(text(row.part.id))}</th>
                <td>${row.cover ? esc(label(row.cover.name)) : `<span class="gear-muted">${esc(text('bare'))}</span>`}</td>
                <td class="is-num">${weapon ? `<strong>${esc(num(row.taken, 1))}</strong>` : esc(text('unknown'))}</td>
                <td class="is-num">${weapon && row.raw > 0 ? `×${esc(num(row.taken / row.raw, 2))}` : esc(text('unknown'))}</td>
                <td class="is-num">${!weapon ? esc(text('unknown')) : row.beam ? esc(text('beam')) : row.hits ? esc(text('shots', { count: num(row.hits) })) : esc(text('takesAll'))}</td>
                <td class="is-num">${weapon && row.seconds !== null ? `${row.mode?.basis === 'upperBound' ? '≥ ' : ''}${esc(text('seconds', { time: num(row.seconds, 1) }))}` : esc(text('unknown'))}</td>
                <td><meter class="gear-meter" min="0" max="${esc(row.part.health)}" value="${esc(Math.max(0, row.part.health - (weapon ? row.taken : 0)))}" aria-label="${esc(text(row.part.id))} ${esc(text('partHealth'))}"></meter> <small class="gear-muted">${esc(num(row.part.health))}</small></td></tr>`).join('')}</tbody></table></div>`;
        return `<p class="gear-note">${esc(text('fitIntro'))}</p>
            <div class="gear-fit">
                <div class="gear-fit-body">${mannequin(rows)}</div>
                <div class="gear-fit-main">
                    <section><h3>${esc(text('wearing'))}</h3><div class="gear-fit-slots">${SLOTS.filter((slot) => slot !== 'backpack').map(slotSelect).join('')}</div>${summary}
                        <button type="button" class="gear-add" data-gear-clear-fit>${esc(text('clearFit'))}</button></section>
                    <section><h3>${esc(text('attacker'))}</h3><div class="gear-fit-slots">
                        <label class="gear-select"><span>${esc(text('weapon'))}</span><select id="gear-fit-weapon">${option('', text('noWeapon'), state.fit.weapon)}${KINDS.filter((kind) => kind !== 'tool').map((kind) => { const list = groupsOf('weapon').filter((group) => group.kind === kind && (group.ammo?.dmg || group.modes?.some((item) => item.beam))); return list.length ? `<optgroup label="${esc(text(kind))}">${list.map((group) => option(group.id, label(group.name), state.fit.weapon)).join('')}</optgroup>` : ''; }).join('')}</select></label>
                        ${modes.length > 1 ? `<label class="gear-select"><span>${esc(text('fireMode'))}</span><select id="gear-fit-mode">${modes.map((item, index) => option(String(index), `${text(item.k)}${item.name ? ` ${item.name}` : ''}`, String(Math.min(state.fit.mode, modes.length - 1)))).join('')}</select></label>` : ''}
                        <label class="gear-select"><span>${esc(text('distance'))}</span><input type="number" id="gear-fit-distance" min="0" max="2000" step="5" inputmode="numeric" value="${esc(state.fit.distance)}"></label>
                    </div></section>
                    <p class="gear-count" role="status">${esc(text('poolLine', { pool: num(body.pool) }))}</p>
                    ${table}
                    ${mode?.basis === 'upperBound' ? `<p class="gear-note">${esc(text('upperNote'))}</p>` : ''}
                    <p class="gear-note">${esc(text('fitNote'))}</p><p class="gear-note">${esc(text('fitLimits'))}</p>
                </div>
            </div>`;
    }

    // ---- 장바구니 -----------------------------------------------------------
    function cartView() {
        const entries = Object.entries(state.cart).map(([uuid, count]) => ({ uuid, count, found: findVariant(uuid) })).filter((entry) => entry.found);
        if (!entries.length) return `<p class="gear-empty">${esc(text('cartEmpty'))}</p>`;
        let total = 0; let unknown = 0; const byShop = new Map();
        const rows = entries.map((entry) => {
            const best = (shopsOf(entry.found.variant, entry.found.view) || [])[0];
            if (best) { total += best.price * entry.count; const key = [best.shop, best.place, best.system].filter(Boolean).join(' · '); byShop.set(key, [...(byShop.get(key) || []), { entry, price: best.price }]); } else unknown += 1;
            const name = variantName(entry.found.variant);
            return `<tr><th scope="row">${esc(name)} <small class="gear-muted">${esc(text(entry.found.view === 'weapon' ? entry.found.group.kind : entry.found.group.slot))}</small></th>
                <td class="is-num"><span class="gear-qty"><button type="button" data-gear-qty="${esc(entry.uuid)}" data-step="-1" aria-label="${esc(name)} ${esc(text('decrease'))}">−</button><span>${esc(num(entry.count))}</span><button type="button" data-gear-qty="${esc(entry.uuid)}" data-step="1" aria-label="${esc(name)} ${esc(text('increase'))}">+</button></span></td>
                <td class="is-num">${best ? `${esc(num(best.price))}` : `<span class="gear-muted">${esc(text('noShop'))}</span>`}</td>
                <td class="is-num">${best ? `<strong>${esc(num(best.price * entry.count))}</strong>` : ''}</td>
                <td>${best ? esc([best.shop, best.place, best.system].filter(Boolean).join(' · ')) : ''}</td>
                <td class="is-num"><button type="button" class="gear-add" data-gear-remove="${esc(entry.uuid)}" aria-label="${esc(name)} ${esc(text('remove'))}">${esc(text('remove'))}</button></td></tr>`;
        }).join('');
        const shops = [...byShop].map(([shop, list]) => `<li><strong>${esc(shop)}</strong><ul>${list.map(({ entry, price }) => `<li>${esc(variantName(entry.found.variant))} × ${esc(num(entry.count))} <small class="gear-muted">${esc(num(price * entry.count))} ${esc(text('uec'))}</small></li>`).join('')}</ul></li>`).join('');
        return `<div class="gear-tablewrap" tabindex="0" role="region" aria-label="${esc(text('cart'))}"><table class="gear-table"><thead><tr><th scope="col">${esc(text('item'))}</th><th scope="col" class="is-num">${esc(text('qty'))}</th><th scope="col" class="is-num">${esc(text('unitPrice'))}</th><th scope="col" class="is-num">${esc(text('subtotal'))}</th><th scope="col">${esc(text('shops'))}</th><th scope="col"></th></tr></thead><tbody>${rows}</tbody></table></div>
            <p class="gear-cart-total">${esc(text('total'))} <strong>${esc(num(total))}</strong> ${esc(text('uec'))}</p>
            ${unknown ? `<p class="gear-note">${esc(text('unknownPrice', { count: unknown }))}</p>` : ''}
            ${shops ? `<section><h3>${esc(text('byShop'))}</h3><ul class="gear-shoplist">${shops}</ul></section>` : ''}
            <button type="button" class="gear-add" data-gear-clear-cart>${esc(text('clearCart'))}</button>
            <p class="gear-note">${esc(text('cartNote'))}</p>`;
    }
    function special() {
        const version = state.data.weapon?.version || state.data.armor?.version || '';
        return `${toolbar()}<div class="gear-special">${state.view === 'fit' ? fitView() : cartView()}</div>
            <p class="gear-sources">${esc(text('sourceGame', { version }))} · ${esc(text('sourcePrice'))}<br>${esc(text('sourceNote'))}${state.data.icons ? `<br>${esc(text('iconCredit'))}` : ''}</p>`;
    }

    function draw(focus) {
        if (!root) return;
        const active = document.activeElement?.id; const caret = active === 'gear-search' ? document.activeElement.selectionStart : null;
        let html;
        // 화면 전체를 이 한 곳에서 다시 그린다. 모든 동적 값은 esc()를 거친다.
        if (state.view === 'fit' || state.view === 'cart') html = special();
        else if (state.error[state.view]) html = `${toolbar()}<div class="gear-status" role="alert"><p>${esc(text('loadError'))}</p><button type="button" class="btn btn-secondary" data-gear-retry>${esc(text('retry'))}</button></div>`;
        else if (!state.data[state.view]) html = `${toolbar()}<p class="gear-status" role="status">${esc(text('loading'))}</p>`;
        else html = `${toolbar()}<div class="gear-columns"><div class="gear-list">${list()}</div><div class="gear-side">${detail()}</div></div>
            <p class="gear-sources">${esc(text('sourceGame', { version: state.data[state.view].version }))} · ${esc(text('sourcePrice'))}<br>${esc(text('sourceNote'))}${state.data.icons ? `<br>${esc(text('iconCredit'))}` : ''}</p>`;
        root.innerHTML = html;
        const target = focus ? root.querySelector(focus) : (active && /^gear-/.test(active) ? document.getElementById(active) : null);
        target?.focus();
        if (caret !== null && target?.id === 'gear-search') target.setSelectionRange(caret, caret);
    }

    async function load(view) {
        if (view === 'fit' || view === 'cart') { await Promise.all(['weapon', 'armor', 'body'].map(load)); if (state.view === view) draw(); return; }
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
        if (state.data[view] && PRICE_CATEGORIES[view]) loadPrices(view);
    }

    function render() {
        root = document.getElementById('gear-app');
        if (!root || started) return;
        started = true;
        root.addEventListener('click', (event) => {
            const target = event.target.closest('button'); if (!target || !root.contains(target)) return;
            if (target.hasAttribute('data-gear-retry')) { load(state.view); return; }
            if (target.dataset.gearView) { state.view = target.dataset.gearView; state.query = ''; state.sort = ''; state.limit = PAGE; draw(`[data-gear-view="${state.view}"]`); load(state.view); return; }
            if (target.dataset.gearAdd) { const uuid = target.dataset.gearAdd; state.cart[uuid] = (state.cart[uuid] || 0) + 1; store(CART_KEY, state.cart); draw(`[data-gear-add="${uuid}"]`); return; }
            if (target.dataset.gearQty) { const uuid = target.dataset.gearQty; const next = (state.cart[uuid] || 0) + Number(target.dataset.step); if (next > 0) state.cart[uuid] = Math.min(next, 99); else delete state.cart[uuid]; store(CART_KEY, state.cart); draw(state.cart[uuid] ? `[data-gear-qty="${uuid}"][data-step="${target.dataset.step}"]` : '[data-gear-view="cart"]'); return; }
            if (target.dataset.gearRemove) { delete state.cart[target.dataset.gearRemove]; store(CART_KEY, state.cart); draw('[data-gear-view="cart"]'); return; }
            if (target.hasAttribute('data-gear-clear-cart')) { state.cart = {}; store(CART_KEY, state.cart); draw('[data-gear-view="cart"]'); return; }
            if (target.hasAttribute('data-gear-clear-fit')) { state.fit.wear = {}; store(FIT_KEY, state.fit); draw('[data-gear-view="fit"]'); return; }
            if (target.dataset.gearWear) { const group = findGroup('armor', target.dataset.gearWear); if (group?.slot) { state.fit.wear[group.slot] = group.id; store(FIT_KEY, state.fit); state.view = 'fit'; draw('[data-gear-view="fit"]'); load('fit'); } return; }
            if (target.dataset.gearShoot) { state.fit.weapon = target.dataset.gearShoot; state.fit.mode = 0; store(FIT_KEY, state.fit); state.view = 'fit'; draw('[data-gear-view="fit"]'); load('fit'); return; }
            if (target.hasAttribute('data-gear-more')) { const before = state.limit; state.limit += PAGE; draw(`.gear-list tbody tr:nth-child(${before + 1}) .gear-rowbtn`); return; }
            if (target.dataset.gearPick) { state.selected[state.view] = target.dataset.gearPick; draw('#gear-detail-title'); }
        });
        root.addEventListener('input', (event) => { if (event.target.id === 'gear-search') { state.query = event.target.value; state.limit = PAGE; draw(); } });
        root.addEventListener('change', (event) => {
            const slot = event.target.dataset?.gearSlot;
            if (slot) { if (event.target.value) state.fit.wear[slot] = event.target.value; else delete state.fit.wear[slot]; store(FIT_KEY, state.fit); draw(`[data-gear-slot="${slot}"]`); return; }
            if (event.target.id === 'gear-fit-weapon') { state.fit.weapon = event.target.value; state.fit.mode = 0; store(FIT_KEY, state.fit); draw('#gear-fit-weapon'); return; }
            if (event.target.id === 'gear-fit-mode') { state.fit.mode = Number(event.target.value) || 0; store(FIT_KEY, state.fit); draw('#gear-fit-mode'); return; }
            if (event.target.id === 'gear-fit-distance') { state.fit.distance = Math.min(2000, Math.max(0, Number(event.target.value) || 0)); store(FIT_KEY, state.fit); draw('#gear-fit-distance'); return; }
            const key = { 'gear-kind': 'kind', 'gear-slot': 'slot', 'gear-class': 'cls', 'gear-sort': 'sort' }[event.target.id]; if (!key) return;
            state[key] = event.target.value; state.limit = PAGE; draw(`#${event.target.id}`);
        });
        window.VOLT_I18N?.onChange?.(() => draw());
        state.cart = readStored(CART_KEY, {});
        const savedFit = readStored(FIT_KEY, null);
        if (savedFit) state.fit = { wear: savedFit.wear && typeof savedFit.wear === 'object' ? savedFit.wear : {}, weapon: String(savedFit.weapon || ''), mode: Number(savedFit.mode) || 0, distance: Number(savedFit.distance) || 0 };
        // 아이콘은 없어도 화면이 동작한다.
        fetch(DATA.icons, { cache: 'no-cache' }).then((response) => (response.ok ? response.json() : null)).then((icons) => { if (icons) { state.data.icons = icons; draw(); } }).catch(() => {});
        load(state.view);
    }

    window.VOLT_GEAR = { render };
})();
