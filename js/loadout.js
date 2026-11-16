/**
 * VOLT 로드아웃 편집기 화면 계층.
 *
 * 함선을 고르고, 장착 자리마다 크기·종류가 맞는 부품으로 바꿔 끼우며
 * 화력·방어·동력·양자 항행과 구매 비용을 확인한다.
 * - 수치 자료: data/loadout/*.json (출처 Erkul Games, scripts/loadout/build-loadout-data.mjs로 생성)
 * - 구매처·가격: /api/uex/loadout-prices (출처 UEX)
 * - 계산: js/loadout-calc.js (window.VOLT_LOADOUT_CALC)
 * 공용 유틸은 main.js가 init(deps)로 주입한다. 로드 순서: loadout-calc.js → loadout.js → main.js.
 */
(function () {
    'use strict';

    const calc = window.VOLT_LOADOUT_CALC;
    const STORAGE_KEY = 'volt-loadout-v1';
    const DATA_BASE = 'data/loadout';
    let deps = {};
    const state = {
        meta: null, index: null, items: null, ko: null, ship: null, shipCls: '', overrides: {},
        query: '', openPath: '', pickerQuery: '', error: '', loading: false,
        prices: new Map(), priceState: new Map(),
    };

    // 화면 문구(이 구역 전용). 정적 제목·설명은 js/i18n.js의 loadout.* 키를 쓴다.
    const TEXT = {
        ko: {
            pickShip: '함선 선택', searchShip: '함선명 또는 제조사 검색', noShip: '검색 결과가 없습니다.', shipCount: '전체 {count}척', shipFound: '검색 결과 {count}척', browseShips: '함선 바꾸기', hideShips: '목록 접기',
            loading: '자료를 불러오는 중입니다.', loadFail: '로드아웃 자료를 불러오지 못했습니다.', retry: '다시 시도',
            summary: '요약', dps: 'DPS (초당 피해)', pilot: '파일럿', turret: '터렛', alpha: '알파 (1회 피해)', weapons: '무기 {count}정',
            missiles: '미사일·폭탄 피해', missileCount: '{count}발 탑재', shield: '실드', shieldRegen: '재생률 {value}/초', power: '파워 플랜트 출력', powerUse: '모든 장비 최대 가동 시 {use} 필요',
            cooling: '쿨러 냉각량', coolingUse: '쿨러 합계', quantum: '퀀텀 드라이브', quantumNone: '퀀텀 드라이브 없음', spool: '스풀링 {value}초', range: '항속 {value} Gm',
            cost: '바꾼 부품 구매 비용', costUnknown: '{count}종은 상점 판매 없음 (파밍 획득)', costNone: '바꾼 부품이 없습니다', same: '동일', dmgWord: '피해', lootNote: '상점 판매 없음으로 표시된 부품은 상점에서 팔지 않고 파밍(전리품)으로 얻는 부품일 수 있습니다. 합계에는 넣지 않았습니다.',
            part: '부품', slots: '장착 자리', change: '변경', close: '닫기', reset: '기본값', empty: '비어 있음', removeItem: '비우기', fixed: '전용 · 교체 불가',
            changed: '변경됨', defaultMark: '기본', pickerSearch: '부품 이름 검색', pickerEmpty: '이 자리에 맞는 부품이 없습니다.', pickerCount: '맞는 부품 {count}종',
            select: '선택', selected: '장착 중', priceFrom: '최저 {price}', priceShops: '판매처 {count}곳', priceNone: '상점 판매 없음 · 파밍 획득', priceLoading: '가격 확인 중',
            priceFail: '가격을 불러오지 못했습니다', shopping: '구매 목록', shoppingEmpty: '부품을 바꾸면 여기에 살 곳과 가격이 정리됩니다.', qty: '수량', cheapest: '가장 싼 곳', subtotal: '소계', total: '합계',
            share: '공유 링크 복사', shareOk: '공유 링크를 복사했습니다.', shareFail: '링크를 복사하지 못했습니다.', resetAll: '전체 기본값으로', resetOk: '기본 장착으로 되돌렸습니다.',
            sourceStats: '함선·부품 수치', sourcePrices: '구매처·가격', sourceTerms: '한국어 표기', sourceVersion: '게임 자료 버전 {version}', sourceNote: '수치는 게임 패치에 따라 달라질 수 있으며 실제 게임과 차이가 있을 수 있습니다.',
            size: '크기', grade: '등급', rpm: '분당 {value}발', perShot: '1발 {value}', speed: '탄속 {value}m/s', reach: '사거리 {value}m', hp: '내구 {value}',
            gen: '출력 {value}', coolGen: '냉각 {value}', qdSpeed: '{value} km/s', dmg: '피해 {value}', lock: '락온 {value}초', signal: '{value} 추적',
            groups: { weapon: '무기·터렛', missile: '미사일·폭탄', shield: '실드 제너레이터', power: '파워 플랜트', cooler: '쿨러', quantum: '퀀텀 드라이브', radar: '레이더', other: '기타 장비' },
            types: {
                WeaponGun: '기총', Turret: '터렛', TurretBase: '유인 터렛', UtilityTurret: '유틸리티 터렛', MissileLauncher: '미사일 랙', BombLauncher: '폭탄 랙',
                GroundVehicleMissileLauncher: '차량 미사일 랙', Missile: '미사일', Bomb: '폭탄', Shield: '실드 제너레이터', PowerPlant: '파워 플랜트', Cooler: '쿨러',
                QuantumDrive: '퀀텀 드라이브', JumpDrive: '점프 모듈', Radar: '레이더', WeaponMining: '채광 레이저 헤드', WeaponDefensive: '디펜시브', EMP: 'EMP',
                QuantumInterdictionGenerator: '퀀텀 차단기', SalvageHead: '샐비징 빔', SalvageModifier: '샐비징 모듈', MiningModifier: '채광 모듈', TractorBeam: '트랙터 빔',
                TowingBeam: '견인 빔', ToolArm: '채광 암', Module: '모듈', Container: '컨테이너', Misc: '기타',
            },
            classes: { Military: '군용', Civilian: '시민', Industrial: '산업', Stealth: '스텔스', Competition: '경쟁' },
            damage: { physical: '물리', energy: '에너지', distortion: '디스토션', thermal: '열', biochemical: '생화학', stun: '스턴' },
            signals: { CrossSection: 'CS', Infrared: 'IR', Electromagnetic: 'EM' },
            tokens: { left: '좌', right: '우', top: '상', bottom: '하', front: '전', rear: '후', nose: '기수', wing: '날개', pilot: '파일럿', tail: '꼬리', center: '중앙', upper: '상부', lower: '하부', side: '측면', chin: '턱', remote: '원격', copilot: '부조종사' },
        },
        en: {
            pickShip: 'Choose a ship', searchShip: 'Search ship or manufacturer', noShip: 'No ships found.', shipCount: 'All {count} ships', shipFound: '{count} ships found', browseShips: 'Change ship', hideShips: 'Hide list',
            loading: 'Loading data.', loadFail: 'Couldn\'t load loadout data.', retry: 'Retry',
            summary: 'Summary', dps: 'Damage per second', pilot: 'Pilot', turret: 'Turrets', alpha: 'Alpha strike', weapons: '{count} weapons',
            missiles: 'Missiles & bombs', missileCount: '{count} loaded', shield: 'Shields', shieldRegen: 'Regen {value}/s', power: 'Power output', powerUse: '{use} needed with everything at full power',
            cooling: 'Cooling capacity', coolingUse: 'All coolers combined', quantum: 'Quantum travel', quantumNone: 'No quantum drive', spool: 'Spool {value}s', range: 'Range {value} Gm',
            cost: 'Cost of changed parts', costUnknown: '{count} not sold in shops (loot only)', costNone: 'No parts changed', same: 'Same', dmgWord: 'Damage', lootNote: 'Parts marked as not sold in shops may only be obtained as loot. They are left out of the total.',
            part: 'Part', slots: 'Hardpoints', change: 'Change', close: 'Close', reset: 'Default', empty: 'Empty', removeItem: 'Leave empty', fixed: 'Bespoke · not swappable',
            changed: 'Changed', defaultMark: 'Stock', pickerSearch: 'Search parts', pickerEmpty: 'No compatible parts for this slot.', pickerCount: '{count} compatible parts',
            select: 'Select', selected: 'Equipped', priceFrom: 'From {price}', priceShops: '{count} shops', priceNone: 'Not sold in shops · loot only', priceLoading: 'Checking prices',
            priceFail: 'Couldn\'t load prices', shopping: 'Shopping list', shoppingEmpty: 'Change a part to see where to buy it and what it costs.', qty: 'Qty', cheapest: 'Cheapest shop', subtotal: 'Subtotal', total: 'Total',
            share: 'Copy share link', shareOk: 'Share link copied.', shareFail: 'Couldn\'t copy the link.', resetAll: 'Reset to stock', resetOk: 'Restored the stock loadout.',
            sourceStats: 'Ship & component stats', sourcePrices: 'Shops & prices', sourceTerms: 'Korean terms', sourceVersion: 'Game data version {version}', sourceNote: 'Values change with game patches and may differ from the live game.',
            size: 'Size', grade: 'Grade', rpm: '{value} rpm', perShot: '{value} per shot', speed: '{value} m/s', reach: '{value} m range', hp: '{value} HP',
            gen: 'Output {value}', coolGen: 'Cooling {value}', qdSpeed: '{value} km/s', dmg: '{value} damage', lock: 'Lock {value}s', signal: '{value} tracking',
            groups: { weapon: 'Weapons & turrets', missile: 'Missiles & bombs', shield: 'Shields', power: 'Power plants', cooler: 'Coolers', quantum: 'Quantum drive', radar: 'Radar', other: 'Other equipment' },
            types: {
                WeaponGun: 'Weapon', Turret: 'Turret / mount', TurretBase: 'Manned turret', UtilityTurret: 'Utility turret', MissileLauncher: 'Missile rack', BombLauncher: 'Bomb rack',
                GroundVehicleMissileLauncher: 'Vehicle missile rack', Missile: 'Missile', Bomb: 'Bomb', Shield: 'Shield generator', PowerPlant: 'Power plant', Cooler: 'Cooler',
                QuantumDrive: 'Quantum drive', JumpDrive: 'Jump module', Radar: 'Radar', WeaponMining: 'Mining laser', WeaponDefensive: 'Countermeasure', EMP: 'EMP generator',
                QuantumInterdictionGenerator: 'Quantum dampener', SalvageHead: 'Salvage head', SalvageModifier: 'Salvage module', MiningModifier: 'Mining module', TractorBeam: 'Tractor beam',
                TowingBeam: 'Towing beam', ToolArm: 'Tool arm', Module: 'Module', Container: 'Cargo module', Misc: 'Other',
            },
            classes: { Military: 'Military', Civilian: 'Civilian', Industrial: 'Industrial', Stealth: 'Stealth', Competition: 'Competition' },
            damage: { physical: 'Physical', energy: 'Energy', distortion: 'Distortion', thermal: 'Thermal', biochemical: 'Biochemical', stun: 'Stun' },
            signals: { CrossSection: 'Cross-section', Infrared: 'Infrared', Electromagnetic: 'EM' },
            tokens: {},
        },
    };
    const GROUP_ORDER = ['weapon', 'missile', 'shield', 'power', 'cooler', 'quantum', 'radar', 'other'];
    const GROUP_BY_TYPE = {
        WeaponGun: 'weapon', Turret: 'weapon', TurretBase: 'weapon', WeaponMining: 'weapon',
        MissileLauncher: 'missile', BombLauncher: 'missile', GroundVehicleMissileLauncher: 'missile', Missile: 'missile', Bomb: 'missile',
        Shield: 'shield', PowerPlant: 'power', Cooler: 'cooler', QuantumDrive: 'quantum', JumpDrive: 'quantum', Radar: 'radar',
    };
    // 우리 부품 종류 → UEX 분류 번호 (구매처·가격 조회용)
    const UEX_CATEGORY = { WeaponGun: 32, Missile: 34, MissileLauncher: 33, Turret: 35, Shield: 23, PowerPlant: 21, Cooler: 19, QuantumDrive: 22, Radar: 83, WeaponMining: 29, Bomb: 70, JumpDrive: 86 };

    function init(injected) { deps = injected || {}; }
    const lang = () => (typeof deps.currentLang === 'function' && deps.currentLang() === 'en' ? 'en' : 'ko');
    const text = (key, vars) => {
        const template = TEXT[lang()][key] ?? TEXT.ko[key] ?? key;
        return String(template).replace(/\{(\w+)\}/g, (_, name) => (vars && Object.hasOwn(vars, name) ? String(vars[name]) : ''));
    };
    const table = (name) => TEXT[lang()][name] || {};
    const esc = (value) => (deps.escapeHtml ? deps.escapeHtml(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
    const num = (value, digits = 0) => (Number(value) || 0).toLocaleString(lang() === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: digits });
    const credits = (value) => `${num(value)} aUEC`;
    const root = () => document.getElementById('loadout-app');
    // 한국어 화면은 게임 한국어 패치의 표기를 먼저 쓴다(퀀텀 드라이브, 파워 플랜트, 쿨러 …).
    const patch = (group) => (lang() === 'ko' && state.ko?.[group]) || {};
    const typeLabel = (type) => patch('types')[type] || table('types')[type] || type || '';
    const itemName = (id, item) => patch('names')[id] || item?.name || '';
    const mfrName = (item) => patch('manufacturers')[item?.mfrCode] || item?.mfr || '';
    const className = (item) => patch('classes')[item?.klass] || table('classes')[item?.klass] || item?.klass || '';
    const GROUP_TYPE = { shield: 'Shield', power: 'PowerPlant', cooler: 'Cooler', quantum: 'QuantumDrive', radar: 'Radar' };
    const groupLabel = (key) => patch('types')[GROUP_TYPE[key]] || table('groups')[key];
    const shipName = (ship) => (deps.shipDisplayName ? deps.shipDisplayName(ship.volt, ship.name) : ship.name) || ship.name;

    async function fetchJson(path, options) {
        const response = await fetch(path, { headers: { Accept: 'application/json' }, ...options });
        if (!response.ok) throw new Error(`LOADOUT ${response.status} ${path}`);
        return response.json();
    }

    function readStored() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_error) { return {}; }
    }
    function writeStored() {
        try {
            const stored = readStored();
            stored.ship = state.shipCls;
            stored.sets = { ...(stored.sets || {}) };
            if (Object.keys(state.overrides).length) stored.sets[state.shipCls] = state.overrides; else delete stored.sets[state.shipCls];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        } catch (_error) { /* 저장 공간을 쓸 수 없어도 편집은 계속된다 */ }
    }

    async function ensureBase() {
        if (state.items && state.index) return;
        // meta는 항상 새로 확인하고, 나머지는 자료 버전을 주소에 붙여 패치 후 옛 캐시가 섞이지 않게 한다.
        const meta = await fetchJson(`${DATA_BASE}/meta.json`, { cache: 'no-cache' });
        const stamp = encodeURIComponent(meta.version || '');
        const [index, items, ko] = await Promise.all([
            fetchJson(`${DATA_BASE}/index.json?v=${stamp}`), fetchJson(`${DATA_BASE}/items.json?v=${stamp}`),
            // 한국어 표기(게임 한국어 패치 기준)는 없어도 화면이 동작한다 — 원문으로 표시.
            fetchJson(`${DATA_BASE}/ko.json?v=${stamp}`).catch(() => null),
        ]);
        state.meta = meta; state.index = index.ships; state.items = items.items; state.ko = ko;
    }

    async function selectShip(cls, overrides) {
        if (!/^[a-z0-9_]+$/i.test(cls || '')) return;
        state.loading = true; state.error = ''; state.openPath = ''; draw();
        try {
            await ensureBase();
            const ship = await fetchJson(`${DATA_BASE}/ships/${cls}.json?v=${encodeURIComponent(state.meta?.version || '')}`);
            state.ship = ship; state.shipCls = cls;
            const stored = overrides ?? readStored().sets?.[cls] ?? {};
            state.overrides = calc.sanitizeOverrides(ship, state.items, stored);
            writeStored();
        } catch (error) {
            console.warn('Loadout load failed', error);
            state.error = text('loadFail');
        }
        state.loading = false; draw();
        loadPricesForChanged();
    }

    async function render() {
        if (!root() || !calc) return;
        state.loading = true; draw();
        try {
            await ensureBase();
            const params = new URLSearchParams(window.location.search);
            const shared = params.get('loadout');
            const stored = readStored();
            const known = (cls) => state.index.some((ship) => ship.cls === cls);
            // 공유 링크는 처음 한 번만 적용한다(언어 전환 등으로 다시 그릴 때 편집 내용을 덮어쓰지 않게).
            if (shared && known(shared) && !state.sharedApplied) { state.sharedApplied = true; return selectShip(shared, calc.decodeOverrides(params.get('set') || '')); }
            if (state.shipCls && known(state.shipCls)) { state.loading = false; draw(); return undefined; }
            if (stored.ship && known(stored.ship)) return selectShip(stored.ship);
        } catch (error) {
            console.warn('Loadout base load failed', error);
            state.error = text('loadFail');
        }
        state.loading = false; draw();
        return undefined;
    }

    // ---- 가격 (UEX) -------------------------------------------------------
    function loadCategoryPrices(type) {
        const category = UEX_CATEGORY[type];
        if (!category || state.priceState.has(category)) return;
        state.priceState.set(category, 'loading');
        fetchJson(`/api/uex/loadout-prices?category=${category}`).then((payload) => {
            for (const [uuid, shops] of Object.entries(payload?.data || {})) state.prices.set(uuid.toLowerCase(), shops);
            state.priceState.set(category, 'ready');
        }).catch((error) => {
            console.warn('Loadout prices failed', error);
            state.priceState.set(category, 'error');
        }).finally(draw);
    }
    function priceInfo(id, item) {
        const category = UEX_CATEGORY[item?.type];
        const status = category ? state.priceState.get(category) : 'none';
        const shops = state.prices.get(String(id).toLowerCase()) || [];
        return { status: shops.length ? 'ready' : status || 'idle', shops, min: shops[0]?.price || 0 };
    }
    function loadPricesForChanged() {
        if (!state.ship) return;
        calc.walkLoadout(state.ship, state.items, state.overrides, ({ item, changed }) => { if (changed && item) loadCategoryPrices(item.type); });
    }

    // ---- 표시 도우미 ------------------------------------------------------
    function slotGroup(slot, item) {
        const type = item?.type || slot.acc?.[0]?.type;
        return GROUP_BY_TYPE[type] || 'other';
    }
    function slotLabel(slot, item) {
        const type = item?.type || slot.acc?.[0]?.type;
        const tokens = table('tokens');
        const hints = String(slot.port || '').toLowerCase().split(/[_\s]+/).map((token) => tokens[token]).filter(Boolean);
        const index = String(slot.port || '').match(/(\d+)(?!.*\d)/)?.[1];
        const size = slot.min !== undefined ? (slot.min === slot.max ? `S${slot.max}` : `S${slot.min}–${slot.max}`) : (item?.size !== undefined ? `S${item.size}` : '');
        return [typeLabel(type), [...new Set(hints)].join('·'), index ? `#${Number(index)}` : '', size].filter(Boolean).join(' ');
    }
    function itemFacts(item) {
        if (!item) return [];
        const facts = [];
        if (item.w) {
            const stats = calc.weaponStats(item);
            if (stats.dps) facts.push(`DPS ${num(stats.dps)}`);
            if (stats.alpha) facts.push(text('perShot', { value: num(stats.alpha, 1) }));
            if (item.w.rpm) facts.push(text('rpm', { value: num(item.w.rpm) }));
            const reach = calc.weaponRange(item);
            if (reach) facts.push(text('reach', { value: num(reach) }));
        }
        if (item.sh) { facts.push(text('hp', { value: num(item.sh.hp) })); facts.push(text('shieldRegen', { value: num(item.sh.regen) })); }
        if (item.power?.gen) facts.push(text('gen', { value: num(item.power.gen) }));
        if (item.cool?.gen) facts.push(text('coolGen', { value: num(item.cool.gen) }));
        if (item.qd) { facts.push(text('qdSpeed', { value: num(item.qd.speed / 1000) })); facts.push(text('spool', { value: num(item.qd.spool, 1) })); }
        if (item.ms) {
            facts.push(text('dmg', { value: num(calc.sumDamage(item.ms.dmg)) }));
            if (item.ms.signal) facts.push(text('signal', { value: table('signals')[item.ms.signal] || item.ms.signal }));
            if (item.ms.lock) facts.push(text('lock', { value: num(item.ms.lock, 1) }));
        }
        return facts;
    }
    function itemMeta(item) {
        const parts = [`S${item.size ?? '?'}`];
        if (item.grade) parts.push(`${text('grade')} ${item.grade}`);
        if (item.klass) parts.push(className(item));
        if (mfrName(item)) parts.push(mfrName(item));
        return parts.join(' · ');
    }

    // ---- 그리기 -----------------------------------------------------------
    function drawShipPicker() {
        const query = state.query.trim().toLowerCase();
        const matches = (state.index || []).filter((ship) => {
            if (!query) return true;
            return [ship.name, ship.mfr, shipName(ship)].some((value) => String(value || '').toLowerCase().includes(query));
        });
        // 함선을 고른 뒤에는 목록을 접어 두고, 검색하거나 "함선 바꾸기"를 누르면 다시 펼친다.
        const expanded = Boolean(query) || !state.ship || state.browsing;
        const option = (ship) => `<button type="button" role="option" aria-selected="${ship.cls === state.shipCls}" data-loadout-ship="${esc(ship.cls)}"><strong>${esc(shipName(ship))}</strong><span>${esc(ship.mfr || '')} · S${esc(ship.size ?? '?')}</span></button>`;
        return `<div class="loadout-shippicker">
            <label for="loadout-ship-search">${esc(text('pickShip'))}</label>
            <div class="loadout-shipsearch">
                <input id="loadout-ship-search" type="search" autocomplete="off" placeholder="${esc(text('searchShip'))}" value="${esc(state.query)}" aria-controls="loadout-ship-results">
                ${state.ship ? `<button type="button" class="btn btn-secondary" data-loadout-browse aria-expanded="${expanded}">${esc(expanded && !query ? text('hideShips') : text('browseShips'))}</button>` : ''}
            </div>
            <p class="loadout-note" id="loadout-ship-count">${esc(text(query ? 'shipFound' : 'shipCount', { count: matches.length }))}</p>
            ${expanded ? `<div class="loadout-ship-results" id="loadout-ship-results" role="listbox" aria-label="${esc(text('pickShip'))}">${matches.map(option).join('') || `<p class="loadout-note">${esc(text('noShip'))}</p>`}</div>` : ''}
        </div>`;
    }

    function costSummary() {
        let total = 0; let unknown = 0; let changed = 0;
        const rows = new Map();
        calc.walkLoadout(state.ship, state.items, state.overrides, ({ item, itemId, changed: isChanged }) => {
            if (!isChanged || !item) return;
            changed += 1;
            const info = priceInfo(itemId, item);
            const row = rows.get(itemId) || { item, id: itemId, qty: 0, info };
            row.qty += 1; rows.set(itemId, row);
            if (info.min) total += info.min; else unknown += 1;
        });
        return { total, unknown, changed, rows: [...rows.values()] };
    }

    function drawSummary(totals, cost) {
        const damage = Object.entries(totals.dps.byType).sort((a, b) => b[1] - a[1]);
        const bar = totals.dps.total ? `<span class="loadout-dmgbar" aria-hidden="true">${damage.map(([type, value]) => `<i class="is-${esc(type)}" style="width:${(value / totals.dps.total * 100).toFixed(1)}%"></i>`).join('')}</span>` : '';
        const byType = damage.map(([type, value]) => `${table('damage')[type] || type} ${num(value)}`).join(' · ');
        const card = (title, value, detail, extra = '', tone = '') => `<div class="loadout-stat${tone ? ` is-${tone}` : ''}"><span class="loadout-stat-label">${esc(title)}</span><strong>${esc(value)}</strong>${extra}${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
        const quantum = totals.quantum;
        return `<div class="loadout-summary" aria-label="${esc(text('summary'))}">
            ${card(text('dps'), num(totals.dps.total), `${text('pilot')} ${num(totals.dps.pilot)} · ${text('turret')} ${num(totals.dps.turret)}${byType ? ` · ${byType}` : ''}`, bar, 'primary')}
            ${card(text('alpha'), num(totals.alpha.total), text('weapons', { count: totals.weapons }))}
            ${card(text('missiles'), num(totals.missiles.damage), text('missileCount', { count: totals.missiles.count }))}
            ${card(text('shield'), num(totals.shield.hp), text('shieldRegen', { value: num(totals.shield.regen) }), '', 'primary')}
            ${card(text('power'), num(totals.power.gen, 1), text('powerUse', { use: num(totals.power.use, 1) }))}
            ${card(text('cooling'), num(totals.cooling.gen, 1), text('coolingUse'))}
            ${quantum ? card(text('quantum'), text('qdSpeed', { value: num(quantum.speed / 1000) }), `${itemName(quantum.id, quantum)} · ${text('spool', { value: num(quantum.spool, 1) })}`) : card(text('quantum'), '—', text('quantumNone'))}
            ${card(text('cost'), cost.changed ? credits(cost.total) : '—', cost.changed ? (cost.unknown ? text('costUnknown', { count: cost.unknown }) : '') : text('costNone'))}
        </div>`;
    }

    // 상점에서 팔지 않는 부품(군용 등 전리품 전용)도 장착 후보에서 빼지 않는다 — 살 수 없다는 사실만 알린다.
    function drawPrice(id, item) {
        const info = priceInfo(id, item);
        if (info.min) return `<span class="loadout-price">${esc(text('priceFrom', { price: credits(info.min) }))} · ${esc(text('priceShops', { count: info.shops.length }))}</span>`;
        if (info.status === 'loading') return `<span class="loadout-price is-muted">${esc(text('priceLoading'))}</span>`;
        if (info.status === 'error') return `<span class="loadout-price is-muted">${esc(text('priceFail'))}</span>`;
        return `<span class="loadout-price is-loot">${esc(text('priceNone'))}</span>`;
    }

    function drawFacts(item) {
        const facts = itemFacts(item);
        return facts.length ? `<span class="loadout-facts">${facts.map((fact) => `<span>${esc(fact)}</span>`).join('')}</span>` : '';
    }

    // 지금 달린 부품과 견준 차이(화력·실드·출력·냉각·속도). 고르기 전에 이득인지 바로 보이게 한다.
    function compareMetric(item) {
        if (!item) return null;
        if (item.w) return { value: calc.weaponStats(item).dps, label: 'DPS' };
        if (item.sh) return { value: Number(item.sh.hp) || 0, label: text('shield') };
        if (item.power?.gen) return { value: Number(item.power.gen) || 0, label: text('power') };
        if (item.cool?.gen) return { value: Number(item.cool.gen) || 0, label: text('cooling') };
        if (item.qd) return { value: (Number(item.qd.speed) || 0) / 1000, label: 'km/s' };
        if (item.ms) return { value: calc.sumDamage(item.ms.dmg), label: text('dmgWord') };
        return null;
    }
    function drawDelta(item, currentItem) {
        const next = compareMetric(item); const now = compareMetric(currentItem);
        if (!next || !now || next.label !== now.label) return '';
        const diff = next.value - now.value;
        if (Math.abs(diff) < 0.5) return `<span class="loadout-delta">${esc(text('same'))}</span>`;
        return `<span class="loadout-delta ${diff > 0 ? 'is-up' : 'is-down'}">${esc(next.label)} ${diff > 0 ? '+' : '−'}${esc(num(Math.abs(diff)))}</span>`;
    }

    function drawPicker(node) {
        const query = state.pickerQuery.trim().toLowerCase();
        const candidates = Object.entries(state.items)
            .filter(([, item]) => calc.fitsSlot(item, node.slot, { tags: node.tags }))
            .filter(([id, item]) => !query || [item.name, itemName(id, item), item.mfr, mfrName(item)].some((value) => String(value || '').toLowerCase().includes(query)))
            .sort(([, a], [, b]) => (b.size || 0) - (a.size || 0) || (compareMetric(b)?.value || 0) - (compareMetric(a)?.value || 0) || String(a.name).localeCompare(String(b.name)));
        const shown = candidates.slice(0, 60);
        return `<div class="loadout-picker" role="region" aria-label="${esc(slotLabel(node.slot, node.item))}">
            <div class="loadout-picker-head">
                <input type="search" id="loadout-picker-search" autocomplete="off" placeholder="${esc(text('pickerSearch'))}" value="${esc(state.pickerQuery)}" aria-label="${esc(text('pickerSearch'))}">
                <span class="loadout-note">${esc(text('pickerCount', { count: candidates.length }))}</span>
                ${node.itemId ? `<button type="button" class="loadout-link" data-loadout-pick="" data-loadout-path="${esc(node.path)}">${esc(text('removeItem'))}</button>` : ''}
            </div>
            <ul class="loadout-options">${shown.map(([id, item]) => `<li class="${id === node.itemId ? 'is-current' : ''}">
                <div class="loadout-option-main">
                    <strong>${esc(itemName(id, item))}</strong>${itemName(id, item) !== item.name ? `<span class="loadout-origin">${esc(item.name)}</span>` : ''}
                    <span class="loadout-meta">${esc(itemMeta(item))}</span>${drawFacts(item)}${drawPrice(id, item)}
                </div>
                <div class="loadout-option-side">
                    ${id === node.itemId ? '' : drawDelta(item, node.item)}
                    <button type="button" class="btn btn-secondary" data-loadout-pick="${esc(id)}" data-loadout-path="${esc(node.path)}" ${id === node.itemId ? 'disabled' : ''}>${esc(id === node.itemId ? text('selected') : text('select'))}</button>
                </div>
            </li>`).join('') || `<li class="loadout-note">${esc(text('pickerEmpty'))}</li>`}</ul>
        </div>`;
    }

    function drawSlot(node) {
        const { slot, item, itemId, path, changed, depth } = node;
        const editable = slot.kind === 's';
        const open = state.openPath === path;
        const indent = `style="--loadout-depth:${Math.max(0, depth - 1)}"`;
        // 고정 마운트·터렛처럼 그 자체는 바꿀 수 없고 아래에 자리를 거느린 부품은 얇은 머리글로만 보여준다.
        if (!editable && node.hasChildren) {
            return `<li class="loadout-slot is-parent" ${indent} data-loadout-slot="${esc(path)}"><span class="loadout-slot-label">${esc(slotLabel(slot, item))}</span><span class="loadout-parent-name">${item ? esc(itemName(itemId, item)) : ''}</span></li>`;
        }
        return `<li class="loadout-slot${changed ? ' is-changed' : ''}" ${indent} data-loadout-slot="${esc(path)}">
            <div class="loadout-slot-row">
                <div class="loadout-slot-main">
                    <span class="loadout-slot-label">${esc(slotLabel(slot, item))}${changed ? ` <em>${esc(text('changed'))}</em>` : ''}</span>
                    <strong class="loadout-item-name">${item ? esc(itemName(itemId, item)) : esc(text('empty'))}</strong>
                    ${item ? `${itemName(itemId, item) !== item.name ? `<span class="loadout-origin">${esc(item.name)}</span>` : ''}<span class="loadout-meta">${esc(itemMeta(item))}</span>${drawFacts(item)}` : ''}
                </div>
                <div class="loadout-slot-actions">
                    ${editable ? `<button type="button" class="btn btn-secondary" data-loadout-open="${esc(path)}" aria-expanded="${open}">${esc(open ? text('close') : text('change'))}</button>` : `<span class="loadout-fixed">${esc(text('fixed'))}</span>`}
                    ${changed ? `<button type="button" class="loadout-link" data-loadout-reset="${esc(path)}">${esc(text('reset'))}</button>` : ''}
                </div>
            </div>
            ${open ? drawPicker(node) : ''}
        </li>`;
    }

    function drawSlots() {
        const groups = new Map(GROUP_ORDER.map((key) => [key, []]));
        let current = 'other';
        const nodes = [];
        calc.walkLoadout(state.ship, state.items, state.overrides, (node) => nodes.push(node));
        nodes.forEach((node, index) => {
            if (node.depth === 0) current = slotGroup(node.slot, node.item);
            // 대응 수단(플레어 등)과 아무것도 달 수 없는 고정 빈자리는 편집 화면에서 숨긴다.
            if (node.item?.type === 'WeaponDefensive' || (!node.item && node.slot.kind !== 's')) return;
            const hasChildren = nodes[index + 1]?.path.startsWith(`${node.path}/`) || false;
            groups.get(current).push({ ...node, depth: node.depth + 1, hasChildren });
        });
        return GROUP_ORDER.filter((key) => groups.get(key).length).map((key) => `<section class="loadout-group">
            <h4>${esc(groupLabel(key))} <span>${groups.get(key).filter((node) => node.slot.kind === 's').length}</span></h4>
            <ul class="loadout-slotlist">${groups.get(key).map(drawSlot).join('')}</ul>
        </section>`).join('');
    }

    function drawShopping(cost) {
        if (!cost.rows.length) return `<p class="loadout-note">${esc(text('shoppingEmpty'))}</p>`;
        return `<div class="loadout-table-wrap"><table class="loadout-table">
            <thead><tr><th>${esc(text('part'))}</th><th>${esc(text('qty'))}</th><th>${esc(text('cheapest'))}</th><th>${esc(text('subtotal'))}</th></tr></thead>
            <tbody>${cost.rows.map((row) => {
        const shop = row.info.shops[0];
        return `<tr><td><strong>${esc(itemName(row.id, row.item))}</strong><span class="loadout-meta">${esc(itemMeta(row.item))}</span></td><td>${row.qty}</td>
                    <td>${shop ? `${esc(shop.shop)}<span class="loadout-meta">${esc([shop.place, shop.system].filter(Boolean).join(', '))}</span>` : drawPrice(row.id, row.item)}</td>
                    <td>${shop ? esc(credits(shop.price * row.qty)) : '—'}</td></tr>`;
    }).join('')}</tbody>
            <tfoot><tr><th colspan="3">${esc(text('total'))}</th><th>${esc(credits(cost.rows.reduce((sum, row) => sum + (row.info.min || 0) * row.qty, 0)))}</th></tr></tfoot>
        </table></div>${cost.unknown ? `<p class="loadout-note">${esc(text('lootNote'))}</p>` : ''}`;
    }

    function drawSources() {
        const meta = state.meta || {};
        return `<p class="loadout-sources" id="loadout-sources">
            <span>${esc(text('sourceStats'))}: <a href="${esc(meta.sourceUrl || 'https://www.erkul.games/')}" target="_blank" rel="noopener noreferrer">Erkul Games</a></span>
            <span>${esc(text('sourcePrices'))}: <a href="${esc(meta.priceSourceUrl || 'https://uexcorp.space/')}" target="_blank" rel="noopener noreferrer">UEX</a></span>
            ${lang() === 'ko' && state.ko?.source ? `<span>${esc(text('sourceTerms'))}: ${esc(state.ko.source)}</span>` : ''}
            ${meta.version ? `<span>${esc(text('sourceVersion', { version: meta.version }))}</span>` : ''}
            <span>${esc(text('sourceNote'))}</span>
        </p>`;
    }

    function draw() {
        const container = root();
        if (!container) return;
        const focusId = document.activeElement?.id;
        const caret = document.activeElement?.selectionStart;
        let body = '';
        if (state.error) body = `<div class="loadout-error" role="alert"><p>${esc(state.error)}</p><button type="button" class="btn btn-secondary" data-loadout-retry>${esc(text('retry'))}</button></div>`;
        else if (!state.index) body = `<p class="loadout-note" role="status">${esc(text('loading'))}</p>`;
        else {
            body = drawShipPicker();
            if (state.loading) body += `<p class="loadout-note" role="status">${esc(text('loading'))}</p>`;
            else if (state.ship) {
                const totals = calc.summarize(state.ship, state.items, state.overrides);
                const cost = costSummary();
                body += `<div class="loadout-shiphead">
                        <h3 id="loadout-ship-title">${esc(shipName(state.ship))}</h3>
                        <div class="loadout-actions">
                            <button type="button" class="btn btn-secondary" data-loadout-share>${esc(text('share'))}</button>
                            <button type="button" class="btn btn-secondary" data-loadout-reset-all ${Object.keys(state.overrides).length ? '' : 'disabled'}>${esc(text('resetAll'))}</button>
                        </div>
                    </div>
                    ${drawSummary(totals, cost)}
                    <div class="loadout-columns">
                        <div class="loadout-slots"><h3>${esc(text('slots'))}</h3>${drawSlots()}</div>
                        <aside class="loadout-shopping"><h3>${esc(text('shopping'))}</h3>${drawShopping(cost)}</aside>
                    </div>`;
            }
            body += drawSources();
        }
        container.innerHTML = body;
        if (focusId) {
            const target = document.getElementById(focusId);
            if (target) { target.focus({ preventScroll: true }); if (typeof caret === 'number' && target.setSelectionRange) { try { target.setSelectionRange(caret, caret); } catch (_error) { /* search 입력이 아닌 경우 */ } } }
        }
    }

    // ---- 동작 -------------------------------------------------------------
    function setOverride(path, id) {
        let node = null;
        calc.walkLoadout(state.ship, state.items, state.overrides, (entry) => { if (entry.path === path) node = entry; });
        if (!node || node.slot.kind !== 's') return;
        const next = {};
        // 이 자리를 바꾸면 그 아래 자리에 해 둔 변경은 의미가 없어지므로 함께 지운다.
        for (const [key, value] of Object.entries(state.overrides)) if (key !== path && !key.startsWith(`${path}/`)) next[key] = value;
        if (id !== (node.slot.item || '')) next[path] = id;
        state.overrides = calc.sanitizeOverrides(state.ship, state.items, next);
        state.openPath = ''; state.pickerQuery = '';
        writeStored(); draw(); loadPricesForChanged();
    }

    function shareUrl() {
        const url = new URL(window.location.href);
        url.search = ''; url.hash = 'loadout';
        url.searchParams.set('loadout', state.shipCls);
        const encoded = calc.encodeOverrides(state.overrides);
        if (encoded) url.searchParams.set('set', encoded);
        return url.toString();
    }

    function handleClick(event) {
        const target = event.target.closest('button');
        if (!target || !root()?.contains(target)) return;
        if (target.hasAttribute('data-loadout-retry')) { state.error = ''; render(); return; }
        if (target.hasAttribute('data-loadout-browse')) { state.browsing = !state.browsing; state.query = ''; draw(); return; }
        const shipCls = target.getAttribute('data-loadout-ship');
        if (shipCls) { state.query = ''; state.browsing = false; selectShip(shipCls); return; }
        const openPath = target.getAttribute('data-loadout-open');
        if (openPath !== null) {
            state.openPath = state.openPath === openPath ? '' : openPath; state.pickerQuery = '';
            if (state.openPath) {
                let node = null;
                calc.walkLoadout(state.ship, state.items, state.overrides, (entry) => { if (entry.path === openPath) node = entry; });
                for (const rule of node?.slot.acc || []) loadCategoryPrices(rule.type);
            }
            draw(); return;
        }
        if (target.hasAttribute('data-loadout-pick')) { setOverride(target.getAttribute('data-loadout-path'), target.getAttribute('data-loadout-pick')); return; }
        const resetPath = target.getAttribute('data-loadout-reset');
        if (resetPath !== null) {
            const next = {};
            for (const [key, value] of Object.entries(state.overrides)) if (key !== resetPath && !key.startsWith(`${resetPath}/`)) next[key] = value;
            state.overrides = next; writeStored(); draw(); return;
        }
        if (target.hasAttribute('data-loadout-reset-all')) { state.overrides = {}; state.openPath = ''; writeStored(); draw(); deps.showToast?.(text('resetOk')); return; }
        if (target.hasAttribute('data-loadout-share')) {
            const url = shareUrl();
            (navigator.clipboard?.writeText ? navigator.clipboard.writeText(url) : Promise.reject(new Error('no clipboard')))
                .then(() => deps.showToast?.(text('shareOk')))
                .catch(() => { deps.showToast?.(text('shareFail')); window.prompt(text('share'), url); });
        }
    }

    function handleInput(event) {
        if (event.target.id === 'loadout-ship-search') { state.query = event.target.value; draw(); }
        if (event.target.id === 'loadout-picker-search') { state.pickerQuery = event.target.value; draw(); }
    }

    document.addEventListener('click', handleClick);
    document.addEventListener('input', handleInput);

    window.VOLT_LOADOUT = { init, render, onLanguageChange: draw };
})();
