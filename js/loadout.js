/**
 * VOLT 로드아웃 편집기 화면 계층.
 *
 * 함선을 고르고, 장착 자리마다 크기·종류가 맞는 부품으로 바꿔 끼우며
 * 화력·방어·동력·양자 항행과 구매 비용을 확인한다.
 * - 수치 자료: data/loadout/*.json (출처: 설치된 게임 파일. scripts/loadout/build-loadout-data.mjs로 생성)
 * - 구매처·가격: /api/uex/loadout-prices (출처 UEX)
 * - 계산: js/loadout-calc.js (window.VOLT_LOADOUT_CALC)
 * 공용 유틸은 main.js가 init(deps)로 주입한다. 로드 순서: loadout-calc.js → loadout.js → main.js.
 */
(function () {
    'use strict';

    const calc = window.VOLT_LOADOUT_CALC;
    const STORAGE_KEY = 'volt-loadout-v1';
    const CART_KEY = 'volt-loadout-cart-v1';
    const DATA_BASE = 'data/loadout';
    let deps = {};
    const state = {
        meta: null, index: null, items: null, ko: null, ship: null, shipCls: '', overrides: {},
        query: '', openPath: '', pickerQuery: '', pickerSort: 'best', pickerGrade: '', pickerClass: '', pickerBuyable: false, pickerBulk: false, error: '', loading: false,
        prices: new Map(), priceState: new Map(),
        tab: '', cart: {}, buildName: '', finderType: '', finderQuery: '', finderSize: '', finderSort: 'best', finderBuyable: false, finderLimit: 40, qtDistance: 30, compare: null, off: {},
    };

    // 화면 문구(이 구역 전용). 정적 제목·설명은 js/i18n.js의 loadout.* 키를 쓴다.
    const TEXT = {
        ko: {
            firepower: '화력', defense: '방어', systems: '파워·쿨러·시그니쳐', weaponCount: '무기', regenLabel: '실드 재생률', perSecond: '/초', seconds: '초',
            shieldCount: '실드 제너레이터', unitCount: '{count}기', signatureEm: 'EM 시그니쳐', signatureIr: 'IR 시그니쳐', qdSpeedLabel: '퀀텀 속도', spoolLabel: '스풀링', cooldownLabel: '쿨다운',
            equipped: '장착', costAll: '바꾼 부품 전부 상점 최저가 기준', crew: '승무원 {count}명', stockState: '기본 장착 상태', changedCount: '{count}곳 변경됨',
            sortLabel: '정렬', sort_best: '성능순', sort_name: '이름순', sort_price: '가격 낮은순', filterLabel: '부품 걸러 보기', buyableOnly: '상점 판매만',
            bulkApply: '같은 부품이 달린 {count}곳을 한 번에 교체', powerShort: '출력', coolingShort: '냉각',
            flight: '비행 성능', scmSpeed: 'SCM 속도', boostSpeed: '부스트 속도', boostBack: '부스트 후진', navSpeed: '최고 속도 (NAV)', pitch: '피치', yaw: '요', roll: '롤', degPerSec: '°/초',
            hullArmor: '선체·장갑', hullHp: '선체 내구도', hullNote: '선체 내구도는 부위별 내구도를 모두 더한 값입니다. 장갑 수치는 받는 피해의 비율이라 낮을수록 단단합니다.', armorHp: '장갑 내구도', mass: '질량', armorTaken: '{type} 피해 받는 비율', armorSignal: '장갑 시그니쳐 배율',
            rangeLabel: '항속 거리', qtFuel: '퀀텀 연료', h2Fuel: '수소 연료', travelFor: '이동 거리 (Gm)', travelTime: '예상 이동 시간', travelNote: '항속 거리와 이동 시간은 게임 파일 수치로 계산한 어림값입니다.', minSec: '{min}분 {sec}초',
            tab_compare: '구성 비교', compareWith: '비교', compareEmpty: '「저장한 로드아웃」에서 「비교」를 누르면 지금 구성과 나란히 견줘 볼 수 있습니다. 먼저 구성을 하나 저장해 보세요.', compareNow: '지금 구성', compareItem: '항목', compareDiff: '차이 (지금 − 비교 대상)', compareClear: '비교 끝내기',
            missileTable: '미사일·폭탄', lockShort: '락온', trackShort: '추적 방식', dmgShort: '피해',
            powerOff: '전원 끄기', powerOn: '전원 켜기', poweredOff: '전원 꺼짐', powerSpare: '남는 출력', powerShort2: '출력 부족', offCount: '부품 {count}개의 전원을 꺼 둔 상태입니다. 꺼진 부품은 화력·실드·소비 전력·시그니쳐 계산에서 빠집니다.', capacitor: '축전 {load}발 · 초당 {rate}발 재생',
            tabsLabel: '로드아웃 화면', tab_slots: '장착', tab_weapons: '무기 상세', tab_finder: '부품 찾기', tab_cart: '장바구니',
            cartEmpty: '장바구니가 비어 있습니다. 부품 찾기나 부품 선택 창에서 「담기」를 눌러 보세요.', cartSummary: '부품 {kinds}종 · {count}개', cartClear: '장바구니 비우기', cartRemove: '빼기',
            cartAdd: '담기', cartAdded: '장바구니에 담았습니다.', inCart: '담음 {count}', cartAddChanged: '바꾼 부품 장바구니에 담기', cartByShop: '상점별로 살 것', qtyLess: '수량 줄이기', qtyMore: '수량 늘리기',
            finderType: '부품 종류', finderCount: '{count}종', finderMore: '더 보기 ({count}종 남음)',
            weaponsNone: '장착된 무기가 없습니다.', whoFires: '사수', dpsSum: 'DPS 합', alphaShort: '알파', rpmShort: '분당 발사', speedShort: '탄속', rangeShort: '사거리', dmgKind: '피해 종류', ammoShort: '탄약', ammoRegen: '재생식',
            resist: '{type} 저항', builds: '저장한 로드아웃', buildName: '이름 (비우면 함선명+날짜)', buildSave: '현재 구성 저장', buildSaved: '로드아웃을 저장했습니다.', buildDelete: '삭제', buildsEmpty: '저장한 로드아웃이 없습니다. 이 브라우저에만 저장됩니다.',
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
            sourceStats: '함선·부품 수치', sourcePrices: '구매처·가격', sourceTerms: '한국어 표기', sourceGame: 'Star Citizen 게임 파일에서 직접 추출', sourceVersion: '게임 자료 버전 {version}', sourceNote: '비공식 팬 사이트입니다. 수치는 게임 패치에 따라 달라지며, 화력 등은 자체 계산이라 실제 게임과 차이가 있을 수 있습니다.',
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
            firepower: 'Firepower', defense: 'Defense', systems: 'Power, cooling & signature', weaponCount: 'Weapons', regenLabel: 'Shield regen', perSecond: '/s', seconds: 's',
            shieldCount: 'Shield generators', unitCount: '{count}', signatureEm: 'EM signature', signatureIr: 'IR signature', qdSpeedLabel: 'Quantum speed', spoolLabel: 'Spool', cooldownLabel: 'Cooldown',
            equipped: 'Equipped', costAll: 'Cheapest shop price for every changed part', crew: 'Crew {count}', stockState: 'Stock loadout', changedCount: '{count} slots changed',
            sortLabel: 'Sort', sort_best: 'Best first', sort_name: 'Name', sort_price: 'Lowest price', filterLabel: 'Filter parts', buyableOnly: 'Sold in shops',
            bulkApply: 'Replace all {count} slots with this part', powerShort: 'Output', coolingShort: 'Cooling',
            flight: 'Flight performance', scmSpeed: 'SCM speed', boostSpeed: 'Boost speed', boostBack: 'Boost reverse', navSpeed: 'Top speed (NAV)', pitch: 'Pitch', yaw: 'Yaw', roll: 'Roll', degPerSec: '°/s',
            hullArmor: 'Hull & armor', hullHp: 'Hull HP', hullNote: 'Hull HP is the sum of every hull part. Armor values are the share of damage taken, so lower is tougher.', armorHp: 'Armor HP', mass: 'Mass', armorTaken: '{type} damage taken', armorSignal: 'Armor signature multiplier',
            rangeLabel: 'Range', qtFuel: 'Quantum fuel', h2Fuel: 'Hydrogen fuel', travelFor: 'Distance (Gm)', travelTime: 'Estimated travel time', travelNote: 'Range and travel time are estimates calculated from game file values.', minSec: '{min}m {sec}s',
            tab_compare: 'Compare', compareWith: 'Compare', compareEmpty: 'Press Compare on a saved loadout to see it next to your current setup. Save a setup first.', compareNow: 'Current setup', compareItem: 'Stat', compareDiff: 'Difference (current − other)', compareClear: 'Stop comparing',
            missileTable: 'Missiles & bombs', lockShort: 'Lock', trackShort: 'Tracking', dmgShort: 'Damage',
            powerOff: 'Power off', powerOn: 'Power on', poweredOff: 'Powered off', powerSpare: 'Spare output', powerShort2: 'Output shortfall', offCount: '{count} parts are powered off. They are left out of firepower, shields, power draw and signatures.', capacitor: 'Capacitor {load} · {rate}/s regen',
            tabsLabel: 'Loadout views', tab_slots: 'Hardpoints', tab_weapons: 'Weapons', tab_finder: 'Part finder', tab_cart: 'Cart',
            cartEmpty: 'Your cart is empty. Use Add in the part finder or the part picker.', cartSummary: '{kinds} parts · {count} items', cartClear: 'Empty cart', cartRemove: 'Remove',
            cartAdd: 'Add', cartAdded: 'Added to cart.', inCart: 'In cart {count}', cartAddChanged: 'Add changed parts to cart', cartByShop: 'What to buy at each shop', qtyLess: 'Decrease quantity', qtyMore: 'Increase quantity',
            finderType: 'Part type', finderCount: '{count} parts', finderMore: 'Show more ({count} left)',
            weaponsNone: 'No weapons equipped.', whoFires: 'Fired by', dpsSum: 'Total DPS', alphaShort: 'Alpha', rpmShort: 'RPM', speedShort: 'Velocity', rangeShort: 'Range', dmgKind: 'Damage', ammoShort: 'Ammo', ammoRegen: 'Regen',
            resist: '{type} resistance', builds: 'Saved loadouts', buildName: 'Name (blank = ship + date)', buildSave: 'Save current setup', buildSaved: 'Loadout saved.', buildDelete: 'Delete', buildsEmpty: 'No saved loadouts. They are stored in this browser only.',
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
            sourceStats: 'Ship & component stats', sourcePrices: 'Shops & prices', sourceTerms: 'Korean terms', sourceGame: 'extracted directly from the Star Citizen game files', sourceVersion: 'Game data version {version}', sourceNote: 'Unofficial fan site. Values change with game patches; firepower figures are our own calculation and may differ from the live game.',
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
    // 함선 이름: 한국어는 게임 한국어 패치 표기, 없으면 게임 원문. (함선DB 자료 로드 시점에 따라 이름이 바뀌지 않게 한다.)
    const shipName = (ship) => patch('ships')[ship.cls] || ship.name;

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
            stored.off = { ...(stored.off || {}) };
            if (Object.keys(state.off).length) stored.off[state.shipCls] = state.off; else delete stored.off[state.shipCls];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        } catch (_error) { /* 저장 공간을 쓸 수 없어도 편집은 계속된다 */ }
    }

    async function ensureBase() {
        if (state.items && state.index) return;
        state.cart = readCart();
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

    // 전원을 꺼 둔 자리 가운데 지금 구성에 실제로 있는 자리만 남긴다.
    function cleanOff(off) {
        const paths = new Set(); calc.walkLoadout(state.ship, state.items, state.overrides, (node) => { if (node.item) paths.add(node.path); });
        return Object.fromEntries(Object.keys(off || {}).filter((key) => off[key] && paths.has(key)).map((key) => [key, true]));
    }

    async function selectShip(cls, overrides, off) {
        if (!/^[a-z0-9_]+$/i.test(cls || '')) return;
        state.loading = true; state.error = ''; state.openPath = ''; draw();
        try {
            await ensureBase();
            const ship = await fetchJson(`${DATA_BASE}/ships/${cls}.json?v=${encodeURIComponent(state.meta?.version || '')}`);
            state.ship = ship; state.shipCls = cls;
            const stored = overrides ?? readStored().sets?.[cls] ?? {};
            state.overrides = calc.sanitizeOverrides(ship, state.items, stored);
            state.off = cleanOff(off ?? (overrides === undefined ? readStored().off?.[cls] : {}) ?? {});
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
            if (shared && known(shared) && !state.sharedApplied) { state.sharedApplied = true; return selectShip(shared, calc.decodeOverrides(params.get('set') || ''), Object.fromEntries((params.get('off') || '').split(',').filter(Boolean).map((key) => [key, true]))); }
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
    // 상위 부품(터렛·마운트·랙)의 위치를 짧게: "터렛 파일럿", "미사일 랙 좌 #2"
    function slotPlace(slot, item) {
        const type = item?.type || slot.acc?.[0]?.type;
        const tokens = table('tokens');
        const hints = String(slot.port || '').toLowerCase().split(/[_\s]+/).map((token) => tokens[token]).filter(Boolean);
        const index = String(slot.port || '').match(/(\d+)(?!.*\d)/)?.[1];
        return [typeLabel(type), [...new Set(hints)].join('·'), index ? `#${Number(index)}` : ''].filter(Boolean).join(' ');
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
    // 화면 구성: [함선 머리 영역] → [장착 자리 보드 | 통계 패널] → [구매 목록] → [출처]
    // 부품 선택은 옆에서 열리는 창(휴대폰은 아래에서 올라오는 창)에서 한다.

    function drawShipPicker() {
        const query = state.query.trim().toLowerCase();
        const matches = (state.index || []).filter((ship) => {
            if (!query) return true;
            return [ship.name, ship.mfr, shipName(ship)].some((value) => String(value || '').toLowerCase().includes(query));
        });
        // 함선을 고른 뒤에는 목록을 접어 두고, 검색하거나 "함선 바꾸기"를 누르면 다시 펼친다.
        const expanded = Boolean(query) || !state.ship || state.browsing;
        const option = (ship) => `<button type="button" role="option" aria-selected="${ship.cls === state.shipCls}" data-loadout-ship="${esc(ship.cls)}"><strong>${esc(shipName(ship))}</strong><span>${esc(ship.mfr || '')}${ship.size ? ` · S${esc(ship.size)}` : ''}</span></button>`;
        return `<div class="loadout-shippicker${state.ship && !expanded ? ' is-compact' : ''}">
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

    function drawShipHead(totals) {
        const ship = state.ship;
        const image = ship.volt ? window.VOLT_SHIP_IMAGERY?.get?.(ship.volt) : null;
        const facts = [mfrName({ mfrCode: ship.mfrCode, mfr: ship.mfr }), ship.size ? `${text('size')} ${ship.size}` : '', ship.base?.crew ? text('crew', { count: ship.base.crew }) : ''].filter(Boolean);
        return `<header class="loadout-shiphead">
            ${image ? `<img class="loadout-shipphoto" src="${esc(image.thumbnail.path)}" width="${image.thumbnail.width}" height="${image.thumbnail.height}" alt="" loading="lazy" decoding="async">` : '<div class="loadout-shipphoto is-empty" aria-hidden="true"></div>'}
            <div class="loadout-shipinfo">
                <h3 id="loadout-ship-title">${esc(shipName(ship))}</h3>
                <p class="loadout-shipfacts">${facts.map((fact) => `<span>${esc(fact)}</span>`).join('')}</p>
                <p class="loadout-shipstate">${esc(totals.changed ? text('changedCount', { count: totals.changed }) : text('stockState'))}</p>
            </div>
            <div class="loadout-actions">
                <button type="button" class="btn btn-secondary" data-loadout-share>${esc(text('share'))}</button>
                <button type="button" class="btn btn-secondary" data-loadout-reset-all ${Object.keys(state.overrides).length || Object.keys(state.off).length ? '' : 'disabled'}>${esc(text('resetAll'))}</button>
            </div>
        </header>`;
    }

    // 기본 장착과 견준 변화량. 바꾼 결과가 이득인지 한눈에 보이게 한다.
    function drawChange(now, stock, digits = 0) {
        const diff = now - stock;
        if (Math.abs(diff) < (digits ? 0.05 : 0.5)) return '';
        return `<span class="loadout-change ${diff > 0 ? 'is-up' : 'is-down'}">${diff > 0 ? '+' : '−'}${esc(num(Math.abs(diff), digits))}</span>`;
    }

    // 실드 저항: 장착된 첫 실드 제너레이터의 피해 종류별 저항 범위(최소~최대).
    function shieldResistRows(row) {
        const shield = allNodes().find((node) => node.item?.sh)?.item?.sh;
        if (!shield?.res) return '';
        const percent = (value) => `${Math.round(value * 100)}%`;
        return ['physical', 'energy', 'distortion'].filter((type) => shield.res[type])
            .map((type) => row(text('resist', { type: table('damage')[type] || type }), `${percent(shield.res[type][0])} – ${percent(shield.res[type][1])}`)).join('');
    }

    function travelText(quantum) {
        const seconds = Math.round(calc.quantumTravelTime(quantum, state.qtDistance));
        if (!seconds) return '—';
        return text('minSec', { min: Math.floor(seconds / 60), sec: seconds % 60 });
    }

    // 비행 성능: 비행 제어기에 적힌 속도와 선회 속도(부품을 바꿔도 변하지 않는 함선 고유 수치).
    function drawFlight() {
        const flight = state.ship.base?.flight;
        if (!flight) return '';
        const cell = (title, value, unit) => `<div class="loadout-stat"><span class="loadout-stat-label">${esc(title)}</span><strong>${esc(value ? num(value, Number.isInteger(value) ? 0 : 1) : '—')}${value ? `<small> ${esc(unit)}</small>` : ''}</strong></div>`;
        return `<section class="loadout-panel-section loadout-flight"><h4>${esc(text('flight'))}</h4>
            <div class="loadout-statpair">${cell(text('scmSpeed'), flight.scm, 'm/s')}${cell(text('navSpeed'), flight.max, 'm/s')}</div>
            <div class="loadout-statpair">${cell(text('boostSpeed'), flight.boost, 'm/s')}${cell(text('boostBack'), flight.boostBack, 'm/s')}</div>
            <div class="loadout-stattrio">${cell(text('pitch'), flight.pitch, text('degPerSec'))}${cell(text('yaw'), flight.yaw, text('degPerSec'))}${cell(text('roll'), flight.roll, text('degPerSec'))}</div>
        </section>`;
    }

    function drawHull(row) {
        const base = state.ship.base || {}; const armor = base.armor || {};
        if (!base.hull && !armor.hp) return '';
        const percent = (value) => `${Math.round(value * 100)}%`;
        const stat = (title, value) => `<div class="loadout-stat"><span class="loadout-stat-label">${esc(title)}</span><strong>${esc(value)}</strong></div>`;
        return `<section class="loadout-panel-section loadout-hull"><h4>${esc(text('hullArmor'))}</h4>
            <div class="loadout-statpair">${stat(text('hullHp'), base.hull ? num(base.hull) : '—')}${stat(text('armorHp'), armor.hp ? num(armor.hp) : '—')}</div>
            <dl class="loadout-rows">
                ${['physical', 'energy', 'distortion'].filter((type) => armor[type] !== undefined).map((type) => row(text('armorTaken', { type: table('damage')[type] || type }), percent(armor[type]))).join('')}
                ${armor.em !== undefined ? row(text('armorSignal'), `EM ×${num(armor.em, 2)} · IR ×${num(armor.ir ?? 1, 2)} · CS ×${num(armor.cs ?? 1, 2)}`) : ''}
                ${base.mass ? row(text('mass'), `${num(base.mass)} kg`) : ''}
            </dl>
            <p class="loadout-note">${esc(text('hullNote'))}</p>
        </section>`;
    }

    function drawSummary(totals, cost, stock) {
        const damage = Object.entries(totals.dps.byType).sort((a, b) => b[1] - a[1]);
        const bar = totals.dps.total ? `<span class="loadout-dmgbar" aria-hidden="true">${damage.map(([type, value]) => `<i class="is-${esc(type)}" style="width:${(value / totals.dps.total * 100).toFixed(1)}%"></i>`).join('')}</span>` : '';
        const legend = damage.map(([type, value]) => `<span class="loadout-legend is-${esc(type)}">${esc(table('damage')[type] || type)} ${esc(num(value))}</span>`).join('');
        const stat = (title, value, change = '', tone = '') => `<div class="loadout-stat${tone ? ` is-${tone}` : ''}"><span class="loadout-stat-label">${esc(title)}</span><strong>${esc(value)}</strong>${change}</div>`;
        const row = (label, value, change = '') => `<div class="loadout-row"><dt>${esc(label)}</dt><dd>${esc(value)}${change}</dd></div>`;
        const section = (title, body) => `<section class="loadout-panel-section"><h4>${esc(title)}</h4>${body}</section>`;
        const quantum = totals.quantum; const stockQuantum = stock.quantum; const fuel = state.ship.base?.fuel || {};
        const powerShare = totals.power.gen ? Math.min(100, totals.power.use / totals.power.gen * 100) : 0;
        return `<aside class="loadout-panel" aria-label="${esc(text('summary'))}">
            ${section(text('firepower'), `
                <div class="loadout-statpair">
                    ${stat(text('dps'), num(totals.dps.total), drawChange(totals.dps.total, stock.dps.total), 'primary')}
                    ${stat(text('alpha'), num(totals.alpha.total), drawChange(totals.alpha.total, stock.alpha.total))}
                </div>
                ${bar}<p class="loadout-legends">${legend}</p>
                <dl class="loadout-rows">
                    ${row(text('pilot'), num(totals.dps.pilot), drawChange(totals.dps.pilot, stock.dps.pilot))}
                    ${row(text('turret'), num(totals.dps.turret), drawChange(totals.dps.turret, stock.dps.turret))}
                    ${row(text('weaponCount'), text('weapons', { count: totals.weapons }))}
                    ${row(text('missiles'), `${num(totals.missiles.damage)} (${text('missileCount', { count: totals.missiles.count })})`, drawChange(totals.missiles.damage, stock.missiles.damage))}
                </dl>`)}
            ${section(text('defense'), `
                <div class="loadout-statpair">
                    ${stat(text('shield'), num(totals.shield.hp), drawChange(totals.shield.hp, stock.shield.hp), 'primary')}
                    ${stat(text('regenLabel'), `${num(totals.shield.regen)}${text('perSecond')}`, drawChange(totals.shield.regen, stock.shield.regen))}
                </div>
                <dl class="loadout-rows">${row(text('shieldCount'), text('unitCount', { count: totals.shield.count }))}${shieldResistRows(row)}</dl>`)}
            ${section(text('systems'), `
                <div class="loadout-statpair">
                    ${stat(text('power'), num(totals.power.gen, 1), drawChange(totals.power.gen, stock.power.gen, 1))}
                    ${stat(text('cooling'), num(totals.cooling.gen, 1), drawChange(totals.cooling.gen, stock.cooling.gen, 1))}
                </div>
                <div class="loadout-meter${powerShare >= 100 ? ' is-over' : ''}" role="img" aria-label="${esc(text('powerUse', { use: num(totals.power.use, 1) }))}"><i style="width:${powerShare.toFixed(1)}%"></i></div>
                <p class="loadout-note">${esc(text('powerUse', { use: num(totals.power.use, 1) }))}</p>
                ${totals.off ? `<p class="loadout-note loadout-offnote">${esc(text('offCount', { count: totals.off }))}</p>` : ''}
                <dl class="loadout-rows">
                    ${row(text(totals.power.gen >= totals.power.use ? 'powerSpare' : 'powerShort2'), num(Math.abs(totals.power.gen - totals.power.use), 1))}
                    ${row(text('signatureEm'), num(totals.signature.em), drawChange(totals.signature.em, stock.signature.em))}
                    ${row(text('signatureIr'), num(totals.signature.ir), drawChange(totals.signature.ir, stock.signature.ir))}
                </dl>`)}
            ${section(text('quantum'), quantum ? `
                <div class="loadout-statpair">
                    ${stat(text('qdSpeedLabel'), text('qdSpeed', { value: num(quantum.speed / 1000) }), stockQuantum ? drawChange(quantum.speed / 1000, stockQuantum.speed / 1000) : '')}
                    ${stat(text('spoolLabel'), `${num(quantum.spool, 1)}${text('seconds')}`, stockQuantum ? drawChange(quantum.spool, stockQuantum.spool, 1) : '')}
                </div>
                <dl class="loadout-rows">${row(text('equipped'), itemName(quantum.id, quantum))}${row(text('cooldownLabel'), `${num(quantum.cooldown, 1)}${text('seconds')}`)}${quantum.range ? row(text('rangeLabel'), `${num(quantum.range)} Gm`, stockQuantum?.range ? drawChange(quantum.range, stockQuantum.range) : '') : ''}${fuel.qt ? row(text('qtFuel'), `${num(fuel.qt, 1)} SCU`) : ''}${fuel.h2 ? row(text('h2Fuel'), `${num(fuel.h2, 1)} SCU`) : ''}</dl>
                <div class="loadout-travel"><label for="loadout-qt-distance">${esc(text('travelFor'))}</label><input type="number" id="loadout-qt-distance" inputmode="decimal" min="1" max="999" step="1" value="${esc(state.qtDistance)}"><span class="loadout-travel-result"><span class="loadout-stat-label">${esc(text('travelTime'))}</span><strong id="loadout-qt-time">${esc(travelText(quantum))}</strong></span></div>
                <p class="loadout-note">${esc(text('travelNote'))}</p>` : `<p class="loadout-note">${esc(text('quantumNone'))}</p>`)}
            ${drawFlight()}${drawHull(row)}
            ${section(text('cost'), `
                <div class="loadout-statpair">${stat(text('cost'), cost.changed ? credits(cost.total) : '—')}</div>
                <p class="loadout-note">${esc(cost.changed ? (cost.unknown ? text('costUnknown', { count: cost.unknown }) : text('costAll')) : text('costNone'))}</p>`)}
            ${drawBuilds()}
        </aside>`;
    }

    // 상점에서 팔지 않는 부품(군용 등 전리품 전용)도 장착 후보에서 빼지 않는다 — 살 수 없다는 사실만 알린다.
    function drawPrice(id, item) {
        const info = priceInfo(id, item);
        if (info.min) return `<span class="loadout-price">${esc(text('priceFrom', { price: credits(info.min) }))} · ${esc(text('priceShops', { count: info.shops.length }))}</span>`;
        if (info.status === 'loading') return `<span class="loadout-price is-muted">${esc(text('priceLoading'))}</span>`;
        if (info.status === 'error') return `<span class="loadout-price is-muted">${esc(text('priceFail'))}</span>`;
        return `<span class="loadout-price is-loot">${esc(text('priceNone'))}</span>`;
    }

    function drawFacts(item, limit) {
        const facts = itemFacts(item).slice(0, limit || 9);
        return facts.length ? `<span class="loadout-facts">${facts.map((fact) => `<span>${esc(fact)}</span>`).join('')}</span>` : '';
    }

    // 지금 달린 부품과 견준 차이(화력·실드·출력·냉각·속도). 고르기 전에 이득인지 바로 보이게 한다.
    function compareMetric(item) {
        if (!item) return null;
        if (item.w) return { value: calc.weaponStats(item).dps, label: 'DPS' };
        if (item.sh) return { value: Number(item.sh.hp) || 0, label: text('shield') };
        if (item.power?.gen) return { value: Number(item.power.gen) || 0, label: text('powerShort') };
        if (item.cool?.gen) return { value: Number(item.cool.gen) || 0, label: text('coolingShort') };
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

    function allNodes() {
        const nodes = [];
        calc.walkLoadout(state.ship, state.items, state.overrides, (node) => nodes.push(node));
        return nodes;
    }
    // 같은 부품이 같은 조건(크기·종류)의 자리에 여러 개 달려 있으면 한 번에 바꿀 수 있게 한다.
    function siblingSlots(node, nodes) {
        const signature = (entry) => `${entry.slot.min}|${entry.slot.max}|${(entry.slot.acc || []).map((rule) => rule.type).join(',')}|${entry.itemId}`;
        const key = signature(node);
        return nodes.filter((entry) => entry.slot.kind === 's' && entry.path !== node.path && signature(entry) === key);
    }

    const SORTS = {
        best: (a, b) => (b.size || 0) - (a.size || 0) || (compareMetric(b)?.value || 0) - (compareMetric(a)?.value || 0),
        name: () => 0,
        price: (a, b, ida, idb) => (priceInfo(ida, a).min || Infinity) - (priceInfo(idb, b).min || Infinity),
    };

    function drawPicker(node, nodes) {
        const query = state.pickerQuery.trim().toLowerCase();
        const fitting = Object.entries(state.items).filter(([, item]) => calc.fitsSlot(item, node.slot, { tags: node.tags }));
        const grades = [...new Set(fitting.map(([, item]) => item.grade).filter(Boolean))].sort();
        const classes = [...new Set(fitting.map(([, item]) => item.klass).filter(Boolean))].sort();
        const candidates = fitting
            .filter(([id, item]) => !query || [item.name, itemName(id, item), item.mfr, mfrName(item)].some((value) => String(value || '').toLowerCase().includes(query)))
            .filter(([, item]) => !state.pickerGrade || item.grade === state.pickerGrade)
            .filter(([, item]) => !state.pickerClass || item.klass === state.pickerClass)
            .filter(([id, item]) => !state.pickerBuyable || priceInfo(id, item).min > 0)
            .sort(([ida, a], [idb, b]) => (SORTS[state.pickerSort] || SORTS.best)(a, b, ida, idb) || String(itemName(ida, a)).localeCompare(String(itemName(idb, b))));
        const shown = candidates.slice(0, 80);
        const siblings = siblingSlots(node, nodes);
        const chip = (attr, value, label, active) => `<button type="button" class="loadout-chip${active ? ' is-active' : ''}" ${attr}="${esc(value)}" aria-pressed="${active}">${esc(label)}</button>`;
        return `<div class="loadout-drawer-backdrop" data-loadout-close></div>
        <div class="loadout-picker" role="dialog" aria-modal="true" aria-label="${esc(slotLabel(node.slot, node.item))}">
            <div class="loadout-picker-title">
                <div><span class="loadout-slot-label">${esc(slotLabel(node.slot, node.item))}</span><strong>${esc(node.item ? itemName(node.itemId, node.item) : text('empty'))}</strong></div>
                <button type="button" class="loadout-close" data-loadout-close aria-label="${esc(text('close'))}">×</button>
            </div>
            <div class="loadout-picker-head">
                <input type="search" id="loadout-picker-search" autocomplete="off" placeholder="${esc(text('pickerSearch'))}" value="${esc(state.pickerQuery)}" aria-label="${esc(text('pickerSearch'))}">
                <label class="loadout-sort"><span>${esc(text('sortLabel'))}</span>
                    <select id="loadout-picker-sort" aria-label="${esc(text('sortLabel'))}">
                        ${['best', 'name', 'price'].map((key) => `<option value="${key}" ${state.pickerSort === key ? 'selected' : ''}>${esc(text(`sort_${key}`))}</option>`).join('')}
                    </select>
                </label>
            </div>
            <div class="loadout-filters" role="group" aria-label="${esc(text('filterLabel'))}">
                ${grades.map((grade) => chip('data-loadout-grade', grade, `${text('grade')} ${grade}`, state.pickerGrade === grade)).join('')}
                ${classes.map((klass) => chip('data-loadout-class', klass, className({ klass }), state.pickerClass === klass)).join('')}
                ${chip('data-loadout-buyable', '1', text('buyableOnly'), Boolean(state.pickerBuyable))}
            </div>
            <p class="loadout-note loadout-picker-count">${esc(text('pickerCount', { count: candidates.length }))}${node.itemId ? ` <button type="button" class="loadout-link" data-loadout-pick="" data-loadout-path="${esc(node.path)}">${esc(text('removeItem'))}</button>` : ''}</p>
            ${siblings.length ? `<label class="loadout-bulk"><input type="checkbox" id="loadout-bulk" ${state.pickerBulk ? 'checked' : ''}> ${esc(text('bulkApply', { count: siblings.length + 1 }))}</label>` : ''}
            <ul class="loadout-options">${shown.map(([id, item]) => `<li class="${id === node.itemId ? 'is-current' : ''}">
                <div class="loadout-option-main">
                    <strong>${esc(itemName(id, item))}</strong>${itemName(id, item) !== item.name ? `<span class="loadout-origin">${esc(item.name)}</span>` : ''}
                    <span class="loadout-meta">${esc(itemMeta(item))}</span>${drawFacts(item)}${drawPrice(id, item)}
                </div>
                <div class="loadout-option-side">
                    ${id === node.itemId ? '' : drawDelta(item, node.item)}
                    <button type="button" class="btn btn-secondary" data-loadout-pick="${esc(id)}" data-loadout-path="${esc(node.path)}" ${id === node.itemId ? 'disabled' : ''}>${esc(id === node.itemId ? text('selected') : text('select'))}</button>
                    <button type="button" class="loadout-link" data-loadout-cart-add="${esc(id)}">${esc(state.cart[id] ? text('inCart', { count: state.cart[id] }) : text('cartAdd'))}</button>
                </div>
            </li>`).join('') || `<li class="loadout-note">${esc(text('pickerEmpty'))}</li>`}</ul>
        </div>`;
    }

    function drawSlot(node) {
        const { slot, item, itemId, path, changed } = node;
        const editable = slot.kind === 's';
        const open = state.openPath === path;
        const off = Boolean(state.off[path]);
        const canPower = item && Number(item.power?.use) > 0;
        const size = slot.max !== undefined ? (slot.min === slot.max || !slot.min ? `S${slot.max}` : `S${slot.min}-${slot.max}`) : (item?.size !== undefined ? `S${item.size}` : '');
        return `<li class="loadout-slot${changed ? ' is-changed' : ''}${open ? ' is-open' : ''}${editable ? '' : ' is-fixed'}${item ? '' : ' is-empty'}${off ? ' is-off' : ''}" data-loadout-slot="${esc(path)}">
            <div class="loadout-slot-row">
                <span class="loadout-size" aria-hidden="true">${esc(size)}</span>
                <div class="loadout-slot-main">
                    ${node.crumb ? `<span class="loadout-crumb">${esc(node.crumb)}</span>` : ''}
                    <span class="loadout-slot-label">${esc(slotPlace(slot, item))}${changed ? ` <em>${esc(text('changed'))}</em>` : ''}${off ? ` <em class="loadout-offmark">${esc(text('poweredOff'))}</em>` : ''}</span>
                    <strong class="loadout-item-name">${item ? esc(itemName(itemId, item)) : esc(text('empty'))}</strong>
                    ${item ? `${itemName(itemId, item) !== item.name ? `<span class="loadout-origin">${esc(item.name)}</span>` : ''}${drawFacts(item, 3)}` : ''}
                </div>
                <div class="loadout-slot-actions">
                    ${editable ? `<button type="button" class="btn btn-secondary" data-loadout-open="${esc(path)}" aria-expanded="${open}">${esc(text('change'))}</button>` : `<span class="loadout-fixed">${esc(text('fixed'))}</span>`}
                    ${changed ? `<button type="button" class="loadout-link" data-loadout-reset="${esc(path)}">${esc(text('reset'))}</button>` : ''}
                    ${canPower || off ? `<button type="button" class="loadout-link loadout-powerbtn" data-loadout-power="${esc(path)}" aria-pressed="${off}">${esc(text(off ? 'powerOn' : 'powerOff'))}</button>` : ''}
                </div>
            </div>
        </li>`;
    }

    function drawSlots(nodes) {
        const groups = new Map(GROUP_ORDER.map((key) => [key, []]));
        let current = 'other';
        const trail = [];
        nodes.forEach((node, index) => {
            if (node.depth === 0) current = slotGroup(node.slot, node.item);
            trail.length = node.depth;
            const hasChildren = nodes[index + 1]?.path.startsWith(`${node.path}/`) || false;
            const crumb = trail.filter(Boolean).join(' › ');
            trail[node.depth] = slotPlace(node.slot, node.item);
            // 대응 수단(플레어 등)과 아무것도 달 수 없는 고정 빈자리는 편집 화면에서 숨긴다.
            if (node.item?.type === 'WeaponDefensive' || (!node.item && node.slot.kind !== 's')) return;
            // 그 자체는 바꿀 수 없고 아래에 자리를 거느린 부품(고정 마운트·터렛)은 타일로 만들지 않는다.
            if (node.slot.kind !== 's' && hasChildren) return;
            groups.get(current).push({ ...node, depth: node.depth + 1, hasChildren, crumb });
        });
        return GROUP_ORDER.filter((key) => groups.get(key).length).map((key) => `<section class="loadout-group is-${key}">
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

    // ---- 장바구니 · 부품 찾기 · 무기 상세 · 저장한 로드아웃 ----------------------
    // 장바구니: 편집과 따로, 사고 싶은 부품을 수량과 함께 담아 두고 어디서 얼마에 사는지 모아 본다.
    function readCart() {
        try { const cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}'); return cart && typeof cart === 'object' && !Array.isArray(cart) ? cart : {}; } catch (_error) { return {}; }
    }
    function writeCart(cart) {
        try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_error) { /* 저장 공간을 쓸 수 없으면 이번 화면에서만 유지 */ }
        state.cart = cart;
    }
    function addToCart(id, quantity = 1) {
        if (!state.items?.[id]) return;
        const cart = { ...state.cart };
        cart[id] = Math.min(99, (Number(cart[id]) || 0) + quantity);
        writeCart(cart);
        loadCategoryPrices(state.items[id].type);
    }
    function setCartQuantity(id, quantity) {
        const cart = { ...state.cart };
        if (quantity > 0) cart[id] = Math.min(99, quantity); else delete cart[id];
        writeCart(cart);
    }
    const cartCount = () => Object.values(state.cart).reduce((total, quantity) => total + (Number(quantity) || 0), 0);
    function cartRows() {
        return Object.entries(state.cart).map(([id, quantity]) => ({ id, item: state.items?.[id], qty: Number(quantity) || 0 }))
            .filter((row) => row.item && row.qty > 0).map((row) => ({ ...row, info: priceInfo(row.id, row.item) }));
    }
    function loadPricesForCart() {
        for (const id of Object.keys(state.cart)) if (state.items?.[id]) loadCategoryPrices(state.items[id].type);
    }

    function drawCart() {
        const rows = cartRows();
        if (!rows.length) return `<div class="loadout-view"><p class="loadout-note">${esc(text('cartEmpty'))}</p></div>`;
        const total = rows.reduce((sum, row) => sum + (row.info.min || 0) * row.qty, 0);
        const unknown = rows.filter((row) => !row.info.min).length;
        // 가장 싼 곳 기준으로 상점별로 묶어, 한 번 들를 때 살 것을 모아 보여준다.
        const byShop = new Map();
        for (const row of rows) {
            const shop = row.info.shops[0];
            if (!shop) continue;
            const key = `${shop.shop}|${shop.place}|${shop.system}`;
            const group = byShop.get(key) || { shop, rows: [], total: 0 };
            group.rows.push(row); group.total += shop.price * row.qty; byShop.set(key, group);
        }
        return `<div class="loadout-view">
            <div class="loadout-viewhead">
                <p class="loadout-note">${esc(text('cartSummary', { kinds: rows.length, count: cartCount() }))}</p>
                <button type="button" class="loadout-link" data-loadout-cart-clear>${esc(text('cartClear'))}</button>
            </div>
            <div class="loadout-table-wrap"><table class="loadout-table loadout-carttable">
                <thead><tr><th>${esc(text('part'))}</th><th>${esc(text('qty'))}</th><th>${esc(text('cheapest'))}</th><th>${esc(text('subtotal'))}</th><th><span class="visually-hidden">${esc(text('cartRemove'))}</span></th></tr></thead>
                <tbody>${rows.map((row) => {
        const shop = row.info.shops[0];
        return `<tr data-loadout-cart-row="${esc(row.id)}">
                    <td><strong>${esc(itemName(row.id, row.item))}</strong><span class="loadout-meta">${esc(`${typeLabel(row.item.type)} · ${itemMeta(row.item)}`)}</span></td>
                    <td><span class="loadout-qty"><button type="button" data-loadout-cart-dec="${esc(row.id)}" aria-label="${esc(text('qtyLess'))}">−</button><b>${row.qty}</b><button type="button" data-loadout-cart-inc="${esc(row.id)}" aria-label="${esc(text('qtyMore'))}">+</button></span></td>
                    <td>${shop ? `${esc(shop.shop)}<span class="loadout-meta">${esc([shop.place, shop.system].filter(Boolean).join(', '))} · ${esc(credits(shop.price))}</span>` : drawPrice(row.id, row.item)}</td>
                    <td>${shop ? esc(credits(shop.price * row.qty)) : '—'}</td>
                    <td><button type="button" class="loadout-link" data-loadout-cart-remove="${esc(row.id)}">${esc(text('cartRemove'))}</button></td>
                </tr>`;
    }).join('')}</tbody>
                <tfoot><tr><th colspan="3">${esc(text('total'))}</th><th colspan="2">${esc(credits(total))}</th></tr></tfoot>
            </table></div>
            ${unknown ? `<p class="loadout-note">${esc(text('lootNote'))}</p>` : ''}
            ${byShop.size ? `<h4 class="loadout-subhead">${esc(text('cartByShop'))}</h4>
            <ul class="loadout-shoplist">${[...byShop.values()].sort((a, b) => b.total - a.total).map((group) => `<li>
                <div><strong>${esc(group.shop.shop)}</strong><span class="loadout-meta">${esc([group.shop.place, group.shop.system].filter(Boolean).join(', '))}</span></div>
                <span class="loadout-shopitems">${group.rows.map((row) => `${esc(itemName(row.id, row.item))} ×${row.qty}`).join(', ')}</span>
                <b>${esc(credits(group.total))}</b>
            </li>`).join('')}</ul>` : ''}
        </div>`;
    }

    // 부품 찾기: 함선과 상관없이 전체 부품을 종류·크기로 훑어보고 장바구니에 담는다.
    const FINDER_TYPES = ['WeaponGun', 'Missile', 'MissileLauncher', 'Turret', 'Shield', 'PowerPlant', 'Cooler', 'QuantumDrive', 'Radar', 'WeaponMining', 'MiningModifier', 'EMP', 'QuantumInterdictionGenerator'];
    function drawFinder() {
        const type = state.finderType || FINDER_TYPES[0];
        const query = state.finderQuery.trim().toLowerCase();
        // 게임 안 이름이 없는 부품(함선 전용 내장 부품 등)은 찾기 목록에서 뺀다. 장착 화면에서는 그대로 보인다.
        const ofType = Object.entries(state.items).filter(([, item]) => item.type === type && item.name !== item.cls);
        const sizes = [...new Set(ofType.map(([, item]) => item.size).filter((size) => size !== undefined))].sort((a, b) => a - b);
        const list = ofType
            .filter(([, item]) => !state.finderSize || String(item.size) === String(state.finderSize))
            .filter(([id, item]) => !query || [item.name, itemName(id, item), item.mfr, mfrName(item)].some((value) => String(value || '').toLowerCase().includes(query)))
            .filter(([id, item]) => !state.finderBuyable || priceInfo(id, item).min > 0)
            .sort(([ida, a], [idb, b]) => (SORTS[state.finderSort] || SORTS.best)(a, b, ida, idb) || String(itemName(ida, a)).localeCompare(String(itemName(idb, b))));
        const shown = list.slice(0, state.finderLimit);
        const chip = (attr, value, label, active) => `<button type="button" class="loadout-chip${active ? ' is-active' : ''}" ${attr}="${esc(value)}" aria-pressed="${active}">${esc(label)}</button>`;
        return `<div class="loadout-view">
            <div class="loadout-filters" role="group" aria-label="${esc(text('finderType'))}">${FINDER_TYPES.map((key) => chip('data-loadout-finder-type', key, typeLabel(key), key === type)).join('')}</div>
            <div class="loadout-picker-head">
                <input type="search" id="loadout-finder-search" autocomplete="off" placeholder="${esc(text('pickerSearch'))}" value="${esc(state.finderQuery)}" aria-label="${esc(text('pickerSearch'))}">
                <label class="loadout-sort"><span>${esc(text('sortLabel'))}</span>
                    <select id="loadout-finder-sort" aria-label="${esc(text('sortLabel'))}">${['best', 'name', 'price'].map((key) => `<option value="${key}" ${state.finderSort === key ? 'selected' : ''}>${esc(text(`sort_${key}`))}</option>`).join('')}</select>
                </label>
            </div>
            <div class="loadout-filters" role="group" aria-label="${esc(text('filterLabel'))}">
                ${sizes.map((size) => chip('data-loadout-finder-size', size, `S${size}`, String(state.finderSize) === String(size))).join('')}
                ${chip('data-loadout-finder-buyable', '1', text('buyableOnly'), Boolean(state.finderBuyable))}
            </div>
            <p class="loadout-note" id="loadout-finder-count">${esc(text('finderCount', { count: list.length }))}</p>
            <ul class="loadout-options loadout-finderlist">${shown.map(([id, item]) => `<li>
                <div class="loadout-option-main">
                    <strong>${esc(itemName(id, item))}</strong>${itemName(id, item) !== item.name ? `<span class="loadout-origin">${esc(item.name)}</span>` : ''}
                    <span class="loadout-meta">${esc(itemMeta(item))}</span>${drawFacts(item)}${drawPrice(id, item)}
                </div>
                <div class="loadout-option-side">
                    ${state.cart[id] ? `<span class="loadout-delta is-up">${esc(text('inCart', { count: state.cart[id] }))}</span>` : ''}
                    <button type="button" class="btn btn-secondary" data-loadout-cart-add="${esc(id)}">${esc(text('cartAdd'))}</button>
                </div>
            </li>`).join('') || `<li class="loadout-note">${esc(text('pickerEmpty'))}</li>`}</ul>
            ${list.length > shown.length ? `<button type="button" class="btn btn-secondary loadout-more" data-loadout-finder-more>${esc(text('finderMore', { count: list.length - shown.length }))}</button>` : ''}
        </div>`;
    }

    // 무기 상세: 지금 달린 무기를 같은 것끼리 묶어 한 표로 견준다.
    function drawWeapons(nodes) {
        const groups = new Map();
        for (const node of nodes) {
            if (!node.item?.w) continue;
            const stats = calc.weaponStats(node.item);
            if (!stats.dps && !stats.alpha) continue;
            const key = `${node.itemId}|${node.turret ? 't' : 'p'}`;
            const group = groups.get(key) || { id: node.itemId, item: node.item, turret: node.turret, count: 0, stats };
            group.count += 1; groups.set(key, group);
        }
        const rows = [...groups.values()].sort((a, b) => Number(a.turret) - Number(b.turret) || b.stats.dps * b.count - a.stats.dps * a.count);
        if (!rows.length) return `<div class="loadout-view"><p class="loadout-note">${esc(text('weaponsNone'))}</p></div>`;
        const kind = (item) => Object.keys(item.w.dmg || item.w.beamDps || {}).map((type) => table('damage')[type] || type).join('·');
        const total = rows.reduce((sum, row) => sum + row.stats.dps * row.count, 0);
        return `<div class="loadout-view"><div class="loadout-table-wrap"><table class="loadout-table loadout-weapontable">
            <thead><tr><th>${esc(text('part'))}</th><th>${esc(text('whoFires'))}</th><th>${esc(text('qty'))}</th><th>${esc(text('size'))}</th><th>DPS</th><th>${esc(text('dpsSum'))}</th><th>${esc(text('alphaShort'))}</th><th>${esc(text('rpmShort'))}</th><th>${esc(text('speedShort'))}</th><th>${esc(text('rangeShort'))}</th><th>${esc(text('dmgKind'))}</th><th>${esc(text('ammoShort'))}</th></tr></thead>
            <tbody>${rows.map((row) => `<tr>
                <td><strong>${esc(itemName(row.id, row.item))}</strong>${itemName(row.id, row.item) !== row.item.name ? `<span class="loadout-origin">${esc(row.item.name)}</span>` : ''}</td>
                <td>${esc(row.turret ? text('turret') : text('pilot'))}</td><td>${row.count}</td><td>S${esc(row.item.size ?? '?')}</td>
                <td>${esc(num(row.stats.dps))}</td><td>${esc(num(row.stats.dps * row.count))}</td><td>${esc(num(row.stats.alpha, 1))}</td>
                <td>${esc(row.item.w.rpm ? num(row.item.w.rpm) : '—')}</td><td>${esc(row.item.w.speed ? `${num(row.item.w.speed)} m/s` : '—')}</td>
                <td>${esc(calc.weaponRange(row.item) ? `${num(calc.weaponRange(row.item))} m` : '—')}</td><td>${esc(kind(row.item))}</td>
                <td>${esc(row.item.w.ammo ? num(row.item.w.ammo) : (row.item.w.regen ? (row.item.w.regen.load ? text('capacitor', { load: num(row.item.w.regen.load), rate: num(row.item.w.regen.perSec || 0, 1) }) : text('ammoRegen')) : '—'))}</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr><th colspan="5">${esc(text('total'))}</th><th colspan="7">${esc(num(total))}</th></tr></tfoot>
        </table></div>${drawMissiles(nodes)}</div>`;
    }

    function drawMissiles(nodes) {
        const groups = new Map();
        for (const node of nodes) {
            if (!node.item?.ms) continue;
            const group = groups.get(node.itemId) || { id: node.itemId, item: node.item, count: 0 };
            group.count += 1; groups.set(node.itemId, group);
        }
        const rows = [...groups.values()].sort((a, b) => (b.item.size || 0) - (a.item.size || 0));
        if (!rows.length) return '';
        const damage = (item) => calc.sumDamage(item.ms.dmg);
        return `<h3 class="loadout-subhead">${esc(text('missileTable'))}</h3><div class="loadout-table-wrap"><table class="loadout-table loadout-missiletable">
            <thead><tr><th>${esc(text('part'))}</th><th>${esc(text('qty'))}</th><th>${esc(text('size'))}</th><th>${esc(text('dmgShort'))}</th><th>${esc(text('speedShort'))}</th><th>${esc(text('lockShort'))}</th><th>${esc(text('rangeShort'))}</th><th>${esc(text('trackShort'))}</th></tr></thead>
            <tbody>${rows.map((row) => `<tr>
                <td><strong>${esc(itemName(row.id, row.item))}</strong>${itemName(row.id, row.item) !== row.item.name ? `<span class="loadout-origin">${esc(row.item.name)}</span>` : ''}</td>
                <td>${row.count}</td><td>S${esc(row.item.size ?? '?')}</td><td>${esc(num(damage(row.item)))}</td>
                <td>${esc(row.item.ms.speed ? `${num(row.item.ms.speed)} m/s` : '—')}</td><td>${esc(row.item.ms.lock ? `${num(row.item.ms.lock, 1)}${text('seconds')}` : '—')}</td>
                <td>${esc(row.item.ms.rangeMax ? `${num(row.item.ms.rangeMax)} m` : '—')}</td><td>${esc(table('signals')[row.item.ms.signal] || row.item.ms.signal || '—')}</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr><th colspan="3">${esc(text('total'))}</th><th colspan="5">${esc(num(rows.reduce((sum, row) => sum + damage(row.item) * row.count, 0)))}</th></tr></tfoot>
        </table></div>`;
    }

    // 구성 비교: 저장해 둔 로드아웃 하나를 지금 구성과 나란히 놓고 본다(다른 함선끼리도 가능).
    function compareMetrics(ship, totals) {
        const flight = ship.base?.flight || {};
        return [
            ['dps', totals.dps.total], ['pilot', totals.dps.pilot], ['turret', totals.dps.turret], ['alpha', totals.alpha.total], ['missiles', totals.missiles.damage],
            ['shield', totals.shield.hp], ['regenLabel', totals.shield.regen], ['hullHp', ship.base?.hull || 0], ['armorHp', ship.base?.armor?.hp || 0],
            ['power', totals.power.gen, 1], ['cooling', totals.cooling.gen, 1], ['signatureEm', totals.signature.em], ['signatureIr', totals.signature.ir],
            ['qdSpeedLabel', (totals.quantum?.speed || 0) / 1000], ['rangeLabel', totals.quantum?.range || 0], ['scmSpeed', flight.scm || 0], ['navSpeed', flight.max || 0],
        ];
    }
    async function startCompare(index) {
        const build = readBuilds()[index];
        if (!build) return;
        state.compare = { name: build.name, cls: build.ship, overrides: build.overrides || {}, off: build.off || {}, ship: null, failed: false };
        state.tab = 'compare'; draw();
        try {
            const ship = build.ship === state.shipCls ? state.ship : await fetchJson(`${DATA_BASE}/ships/${build.ship}.json?v=${encodeURIComponent(state.meta?.version || '')}`);
            if (state.compare?.name !== build.name) return;
            state.compare.ship = ship;
            state.compare.overrides = calc.sanitizeOverrides(ship, state.items, build.overrides || {});
        } catch (error) {
            console.warn('Loadout compare load failed', error);
            if (state.compare) state.compare.failed = true;
        }
        draw();
    }
    function drawCompare(totals) {
        const other = state.compare;
        if (!other) return `<div class="loadout-view"><p class="loadout-note">${esc(text('compareEmpty'))}</p></div>`;
        if (other.failed) return `<div class="loadout-view"><p class="loadout-note" role="alert">${esc(text('loadFail'))}</p></div>`;
        if (!other.ship) return `<div class="loadout-view"><p class="loadout-note" role="status">${esc(text('loading'))}</p></div>`;
        const mine = compareMetrics(state.ship, totals);
        const theirs = compareMetrics(other.ship, calc.summarize(other.ship, state.items, other.overrides, { off: other.off }));
        return `<div class="loadout-view"><div class="loadout-viewhead"><h3>${esc(text('tab_compare'))}</h3><button type="button" class="btn btn-secondary" data-loadout-compare-clear>${esc(text('compareClear'))}</button></div>
            <div class="loadout-table-wrap"><table class="loadout-table loadout-comparetable">
            <thead><tr><th>${esc(text('compareItem'))}</th><th>${esc(text('compareNow'))}<span class="loadout-origin">${esc(shipName(state.ship))}</span></th><th>${esc(other.name)}<span class="loadout-origin">${esc(shipName(other.ship))}</span></th><th>${esc(text('compareDiff'))}</th></tr></thead>
            <tbody>${mine.map(([key, value, digits = 0], index) => `<tr><th scope="row">${esc(text(key))}</th><td>${esc(num(value, digits))}</td><td>${esc(num(theirs[index][1], digits))}</td><td>${drawChange(value, theirs[index][1], digits) || `<span class="loadout-meta">${esc(text('same'))}</span>`}</td></tr>`).join('')}</tbody>
        </table></div></div>`;
    }

    // 저장한 로드아웃: 이름을 붙여 여러 구성을 보관하고 다시 불러온다(이 브라우저에만 저장).
    function readBuilds() { const builds = readStored().builds; return Array.isArray(builds) ? builds : []; }
    function writeBuilds(builds) {
        try { const stored = readStored(); stored.builds = builds.slice(0, 40); localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch (_error) { /* 저장 실패는 조용히 넘긴다 */ }
    }
    function drawBuilds() {
        const builds = readBuilds();
        const row = (build, index) => {
            const ship = state.index.find((entry) => entry.cls === build.ship);
            return `<li><button type="button" class="loadout-buildload" data-loadout-build-load="${index}"><strong>${esc(build.name)}</strong><span class="loadout-meta">${esc(ship ? shipName(ship) : build.ship)} · ${esc(text('changedCount', { count: Object.keys(build.overrides || {}).length }))}</span></button><button type="button" class="loadout-link" data-loadout-build-compare="${index}">${esc(text('compareWith'))}</button><button type="button" class="loadout-link" data-loadout-build-delete="${index}">${esc(text('buildDelete'))}</button></li>`;
        };
        return `<section class="loadout-panel-section loadout-builds"><h4>${esc(text('builds'))}</h4>
            <div class="loadout-buildsave"><input type="text" id="loadout-build-name" maxlength="40" placeholder="${esc(text('buildName'))}" aria-label="${esc(text('buildName'))}" value="${esc(state.buildName || '')}"><button type="button" class="btn btn-secondary" data-loadout-build-save>${esc(text('buildSave'))}</button></div>
            ${builds.length ? `<ul class="loadout-buildlist">${builds.map(row).join('')}</ul>` : `<p class="loadout-note">${esc(text('buildsEmpty'))}</p>`}
        </section>`;
    }

    function drawTabs() {
        const tabs = state.ship ? ['slots', 'weapons', 'compare', 'finder', 'cart'] : ['finder', 'cart'];
        const count = cartCount();
        return `<div class="loadout-tabs" role="tablist" aria-label="${esc(text('tabsLabel'))}">${tabs.map((key) => `<button type="button" role="tab" aria-selected="${state.tab === key}" class="loadout-tab${state.tab === key ? ' is-active' : ''}" data-loadout-tab="${key}">${esc(text(`tab_${key}`))}${key === 'cart' && count ? ` <span class="loadout-badge">${count}</span>` : ''}</button>`).join('')}</div>`;
    }

    function drawSources() {
        const meta = state.meta || {};
        return `<p class="loadout-sources" id="loadout-sources">
            <span>${esc(text('sourceStats'))}: ${esc(text('sourceGame'))}</span>
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
        const scrolled = container.querySelector('.loadout-options')?.scrollTop || 0;
        let body = '';
        if (state.error) body = `<div class="loadout-error" role="alert"><p>${esc(state.error)}</p><button type="button" class="btn btn-secondary" data-loadout-retry>${esc(text('retry'))}</button></div>`;
        else if (!state.index) body = `<p class="loadout-note" role="status">${esc(text('loading'))}</p>`;
        else {
            body = drawShipPicker();
            if (state.loading) body += `<p class="loadout-note" role="status">${esc(text('loading'))}</p>`;
            else if (state.ship) {
                const totals = calc.summarize(state.ship, state.items, state.overrides, { off: state.off });
                const stock = calc.summarize(state.ship, state.items, {});
                const cost = costSummary();
                const nodes = allNodes();
                const openNode = state.openPath ? nodes.find((node) => node.path === state.openPath) : null;
                if (!['slots', 'weapons', 'compare', 'finder', 'cart'].includes(state.tab)) state.tab = 'slots';
                const main = state.tab === 'weapons' ? drawWeapons(nodes) : state.tab === 'compare' ? drawCompare(totals) : state.tab === 'finder' ? drawFinder() : state.tab === 'cart' ? drawCart()
                    : `${drawSlots(nodes)}<section class="loadout-shopping"><div class="loadout-viewhead"><h3>${esc(text('shopping'))}</h3>${cost.rows.length ? `<button type="button" class="btn btn-secondary" data-loadout-cart-changed>${esc(text('cartAddChanged'))}</button>` : ''}</div>${drawShopping(cost)}</section>`;
                body += `${drawShipHead(totals)}
                    ${drawTabs()}
                    <div class="loadout-columns">
                        <div class="loadout-slots">${main}</div>
                        ${drawSummary(totals, cost, stock)}
                    </div>
                    ${openNode ? drawPicker(openNode, nodes) : ''}`;
            }
            if (!state.ship && !state.loading) {
                if (!['finder', 'cart'].includes(state.tab)) state.tab = '';
                body += `${drawTabs()}${state.tab === 'finder' ? drawFinder() : state.tab === 'cart' ? drawCart() : ''}`;
            }
            body += drawSources();
        }
        container.innerHTML = body;
        container.classList.toggle('has-drawer', Boolean(state.openPath && state.ship));
        const options = container.querySelector('.loadout-options');
        if (options && scrolled) options.scrollTop = scrolled;
        if (focusId) {
            const target = document.getElementById(focusId);
            if (target) { target.focus({ preventScroll: true }); if (typeof caret === 'number' && target.setSelectionRange) { try { target.setSelectionRange(caret, caret); } catch (_error) { /* search 입력이 아닌 경우 */ } } }
        }
    }

    // ---- 동작 -------------------------------------------------------------
    function closePicker() {
        state.openPath = ''; state.pickerQuery = ''; state.pickerGrade = ''; state.pickerClass = ''; state.pickerBuyable = false; state.pickerBulk = false;
    }

    function setOverride(path, id) {
        const nodes = allNodes();
        const node = nodes.find((entry) => entry.path === path);
        if (!node || node.slot.kind !== 's') return;
        const targets = state.pickerBulk ? [node, ...siblingSlots(node, nodes)] : [node];
        let next = { ...state.overrides };
        for (const target of targets) {
            // 이 자리를 바꾸면 그 아래 자리에 해 둔 변경은 의미가 없어지므로 함께 지운다.
            next = Object.fromEntries(Object.entries(next).filter(([key]) => key !== target.path && !key.startsWith(`${target.path}/`)));
            if (id !== (target.slot.item || '')) next[target.path] = id;
        }
        state.overrides = calc.sanitizeOverrides(state.ship, state.items, next);
        state.off = cleanOff(Object.fromEntries(Object.keys(state.off).filter((key) => !targets.some((entry) => key === entry.path || key.startsWith(`${entry.path}/`))).map((key) => [key, true])));
        closePicker();
        writeStored(); draw(); loadPricesForChanged();
    }

    function shareUrl() {
        const url = new URL(window.location.href);
        url.search = ''; url.hash = 'loadout';
        url.searchParams.set('loadout', state.shipCls);
        const encoded = calc.encodeOverrides(state.overrides);
        if (encoded) url.searchParams.set('set', encoded);
        if (Object.keys(state.off).length) url.searchParams.set('off', Object.keys(state.off).sort().join(','));
        return url.toString();
    }

    function handleClick(event) {
        if (!root()?.contains(event.target)) return;
        if (event.target.closest('[data-loadout-close]')) { closePicker(); draw(); return; }
        const target = event.target.closest('button');
        if (!target) return;
        if (target.hasAttribute('data-loadout-retry')) { state.error = ''; render(); return; }
        if (target.hasAttribute('data-loadout-browse')) { state.browsing = !state.browsing; state.query = ''; draw(); return; }
        const shipCls = target.getAttribute('data-loadout-ship');
        if (shipCls) { state.query = ''; state.browsing = false; closePicker(); selectShip(shipCls); return; }
        const openPath = target.getAttribute('data-loadout-open');
        if (openPath !== null) {
            const same = state.openPath === openPath;
            closePicker();
            if (!same) {
                state.openPath = openPath;
                const node = allNodes().find((entry) => entry.path === openPath);
                for (const rule of node?.slot.acc || []) loadCategoryPrices(rule.type);
            }
            draw();
            if (!same) document.getElementById('loadout-picker-search')?.focus({ preventScroll: true });
            return;
        }
        const grade = target.getAttribute('data-loadout-grade');
        if (grade !== null) { state.pickerGrade = state.pickerGrade === grade ? '' : grade; draw(); return; }
        const klass = target.getAttribute('data-loadout-class');
        if (klass !== null) { state.pickerClass = state.pickerClass === klass ? '' : klass; draw(); return; }
        if (target.hasAttribute('data-loadout-buyable')) { state.pickerBuyable = !state.pickerBuyable; draw(); return; }
        if (target.hasAttribute('data-loadout-pick')) { setOverride(target.getAttribute('data-loadout-path'), target.getAttribute('data-loadout-pick')); return; }
        const powerPath = target.getAttribute('data-loadout-power');
        if (powerPath !== null) {
            const next = { ...state.off };
            if (next[powerPath]) delete next[powerPath]; else next[powerPath] = true;
            state.off = next; writeStored(); draw(); return;
        }
        const resetPath = target.getAttribute('data-loadout-reset');
        if (resetPath !== null) {
            state.overrides = Object.fromEntries(Object.entries(state.overrides).filter(([key]) => key !== resetPath && !key.startsWith(`${resetPath}/`)));
            state.off = cleanOff(state.off);
            writeStored(); draw(); return;
        }
        if (target.hasAttribute('data-loadout-reset-all')) { state.overrides = {}; state.off = {}; closePicker(); writeStored(); draw(); deps.showToast?.(text('resetOk')); return; }
        const tab = target.getAttribute('data-loadout-tab');
        if (tab !== null) { state.tab = tab; closePicker(); if (tab === 'cart') loadPricesForCart(); if (tab === 'finder') loadCategoryPrices(state.finderType || FINDER_TYPES[0]); draw(); return; }
        const cartAdd = target.getAttribute('data-loadout-cart-add');
        if (cartAdd !== null) { addToCart(cartAdd); deps.showToast?.(text('cartAdded')); draw(); return; }
        if (target.hasAttribute('data-loadout-cart-changed')) {
            for (const row of costSummary().rows) addToCart(row.id, row.qty);
            deps.showToast?.(text('cartAdded')); draw(); return;
        }
        const inc = target.getAttribute('data-loadout-cart-inc');
        if (inc !== null) { setCartQuantity(inc, (Number(state.cart[inc]) || 0) + 1); draw(); return; }
        const dec = target.getAttribute('data-loadout-cart-dec');
        if (dec !== null) { setCartQuantity(dec, (Number(state.cart[dec]) || 0) - 1); draw(); return; }
        const remove = target.getAttribute('data-loadout-cart-remove');
        if (remove !== null) { setCartQuantity(remove, 0); draw(); return; }
        if (target.hasAttribute('data-loadout-cart-clear')) { writeCart({}); draw(); return; }
        const finderType = target.getAttribute('data-loadout-finder-type');
        if (finderType !== null) { state.finderType = finderType; state.finderSize = ''; state.finderLimit = 40; loadCategoryPrices(finderType); draw(); return; }
        const finderSize = target.getAttribute('data-loadout-finder-size');
        if (finderSize !== null) { state.finderSize = String(state.finderSize) === finderSize ? '' : finderSize; state.finderLimit = 40; draw(); return; }
        if (target.hasAttribute('data-loadout-finder-buyable')) { state.finderBuyable = !state.finderBuyable; draw(); return; }
        if (target.hasAttribute('data-loadout-finder-more')) { state.finderLimit += 40; draw(); return; }
        if (target.hasAttribute('data-loadout-build-save')) {
            const name = (document.getElementById('loadout-build-name')?.value || '').trim() || `${shipName(state.ship)} ${new Date().toLocaleDateString(lang() === 'en' ? 'en-US' : 'ko-KR')}`;
            writeBuilds([{ name: name.slice(0, 40), ship: state.shipCls, overrides: state.overrides, off: state.off, at: Date.now() }, ...readBuilds().filter((build) => !(build.name === name && build.ship === state.shipCls))]);
            state.buildName = ''; deps.showToast?.(text('buildSaved')); draw(); return;
        }
        const buildLoad = target.getAttribute('data-loadout-build-load');
        if (buildLoad !== null) { const build = readBuilds()[Number(buildLoad)]; if (build) { state.tab = 'slots'; closePicker(); selectShip(build.ship, build.overrides || {}, build.off || {}); } return; }
        const buildCompare = target.getAttribute('data-loadout-build-compare');
        if (buildCompare !== null) { closePicker(); startCompare(Number(buildCompare)); return; }
        if (target.hasAttribute('data-loadout-compare-clear')) { state.compare = null; state.tab = 'slots'; draw(); return; }
        const buildDelete = target.getAttribute('data-loadout-build-delete');
        if (buildDelete !== null) { writeBuilds(readBuilds().filter((_, index) => index !== Number(buildDelete))); draw(); return; }
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
        if (event.target.id === 'loadout-finder-search') { state.finderQuery = event.target.value; state.finderLimit = 40; draw(); }
        if (event.target.id === 'loadout-build-name') { state.buildName = event.target.value; }
        if (event.target.id === 'loadout-qt-distance') {
            // 입력 중에는 화면 전체를 다시 그리지 않고 결과 글자만 바꾼다(숫자 입력이 끊기지 않게).
            state.qtDistance = Math.max(0, Math.min(999, Number(event.target.value) || 0));
            const output = document.getElementById('loadout-qt-time');
            const quantum = state.ship ? calc.summarize(state.ship, state.items, state.overrides, { off: state.off }).quantum : null;
            if (output) output.textContent = quantum ? travelText(quantum) : '—';
        }
    }
    function handleChange(event) {
        if (event.target.id === 'loadout-picker-sort') { state.pickerSort = event.target.value; draw(); }
        if (event.target.id === 'loadout-finder-sort') { state.finderSort = event.target.value; draw(); }
        if (event.target.id === 'loadout-bulk') { state.pickerBulk = event.target.checked; }
    }
    function handleKeydown(event) {
        if (event.key === 'Escape' && state.openPath && root()) { closePicker(); draw(); }
    }

    document.addEventListener('click', handleClick);
    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);
    document.addEventListener('keydown', handleKeydown);

    window.VOLT_LOADOUT = { init, render, onLanguageChange: draw };
})();
