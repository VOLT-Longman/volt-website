/**
 * VOLT 로드아웃 계산 계층 (순수 함수).
 *
 * 화면(js/loadout.js)과 자료 생성 스크립트(scripts/loadout/build-loadout-data.mjs),
 * 서버 테스트가 같은 계산식을 쓰도록 DOM에 의존하지 않는다. 브라우저에서는
 * window.VOLT_LOADOUT_CALC, Node에서는 module.exports로 노출한다.
 *
 * 입력 자료 형식은 data/loadout/items.json · data/loadout/ships/<id>.json 이다
 * (출처: 설치된 게임 파일, 구매처·가격: UEX).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.VOLT_LOADOUT_CALC = api;
})(typeof window !== 'undefined' ? window : null, () => {
    'use strict';

    const DAMAGE_TYPES = ['physical', 'energy', 'distortion', 'thermal', 'biochemical', 'stun'];
    // Shared with extraction: internal Battery/WeaponBarrel ports are not editor slots.
    const COMPONENT_TYPES = ['WeaponGun', 'Turret', 'TurretBase', 'MissileLauncher', 'BombLauncher', 'GroundVehicleMissileLauncher', 'Missile', 'Bomb', 'Shield', 'PowerPlant',
        'Cooler', 'QuantumDrive', 'JumpDrive', 'Radar', 'WeaponMining', 'WeaponDefensive', 'EMP', 'QuantumInterdictionGenerator', 'SalvageHead',
        'TractorBeam', 'ToolArm', 'Module', 'UtilityTurret', 'MiningModifier', 'SalvageModifier', 'TowingBeam'];
    const componentTypes = new Set(COMPONENT_TYPES);

    function sumDamage(damage) {
        return DAMAGE_TYPES.reduce((total, type) => total + (Number(damage?.[type]) || 0), 0);
    }

    // 무기 1정의 1발 피해(alpha)와 초당 피해(dps).
    // - single/rapid/burst: 1발 피해 × 분당 발사 수 ÷ 60
    // - charged(완충 후 발사): 1발 피해 ÷ (충전 시간 + 재사용 대기)
    // - beam: 자료에 적힌 초당 피해를 그대로 쓴다
    // 발사 방식 하나의 초당 발사 수.
    // - single/rapid/burst: 분당 발사 수 ÷ 60
    // - charged(완충 후 발사): 1 ÷ (충전 시간 + 재사용 대기 + 발사 간격)
    function shotsPerSecond(action) {
        const interval = action.rpm ? 60 / action.rpm : 0;
        if (action.kind === 'charged' && (action.charge || action.cooldown)) return 1 / ((action.charge || 0) + (action.cooldown || 0) + interval);
        return (action.rpm || 0) / 60;
    }

    // 무기 1정의 1발 피해(alpha)와 초당 피해(dps). 기본 발사 방식 기준이며, 광선은 자료의 초당 피해를 쓴다.
    function weaponStats(item) {
        const w = item?.w;
        if (!w) return { alpha: 0, dps: 0, byType: {} };
        const byType = {};
        let alpha = 0; let dps = 0;
        [w].forEach((action, index) => {
            if (action.kind === 'beam') {
                for (const type of DAMAGE_TYPES) {
                    const value = Number(action.beamDps?.[type]) || 0;
                    if (!value) continue;
                    byType[type] = (byType[type] || 0) + value; dps += value;
                }
                return;
            }
            const rate = shotsPerSecond(action);
            for (const type of DAMAGE_TYPES) {
                const value = (Number(w.dmg?.[type]) || 0) * (action.pellets || 1) * (action.mult ?? 1);
                if (!value) continue;
                if (index === 0) alpha += value;
                byType[type] = (byType[type] || 0) + value * rate; dps += value * rate;
            }
        });
        return { alpha, dps, byType };
    }

    // 오래 쏠 때의 초당 피해(지속 DPS)와 그 근거.
    // - 실탄 무기: 쏠 때마다 열이 오르고(heat), 한도(oh.max)에 닿으면 oh.fix초 동안 못 쏜다.
    //   발사 간격이 oh.start보다 길면 그 사이 oh.cool만큼 식는다.
    // - 에너지 무기: 축전 탄창(regen.load)을 다 쏘면 regen.cd초 뒤부터 초당 regen.perSec발씩 다시 찬다.
    // 두 제한이 없는 무기는 순간 DPS와 같다. limit: 'heat' | 'cap' | ''.
    function weaponSustain(item) {
        const stats = weaponStats(item);
        const w = item?.w;
        const none = { dps: stats.dps, ratio: stats.dps ? 1 : 0, limit: '', fireTime: 0, downTime: 0, shots: 0 };
        if (!w || !stats.dps || w.kind === 'beam') return none;
        const rate = shotsPerSecond(w);
        if (!rate) return none;
        const interval = 1 / rate;
        let best = none;
        const consider = (limit, shots, fireTime, downTime) => {
            const cycle = fireTime + downTime;
            if (!(cycle > 0) || !(shots > 0)) return;
            const dps = Math.min(stats.dps, stats.alpha * shots / cycle);
            if (dps < best.dps) best = { dps, ratio: dps / stats.dps, limit, fireTime, downTime, shots };
        };
        if (w.heat && w.oh?.max) {
            const cooled = Math.max(0, interval - (w.oh.start || 0)) * (w.oh.cool || 0);
            const net = w.heat - cooled;
            const room = w.oh.max - (w.oh.after || 0);
            if (net > 0 && room > 0) {
                const shots = Math.max(1, Math.ceil((room - w.heat) / net) + 1);
                consider('heat', shots, (shots - 1) * interval, Math.max(w.oh.fix || 0, interval));
            }
        }
        if (w.regen?.load && w.regen.perSec) {
            consider('cap', w.regen.load, w.regen.load * interval, (w.regen.cd || 0) + w.regen.load / w.regen.perSec);
        }
        return best;
    }

    // 화력에 넣는 무기인지. 채광 레이저·디코이 발사기도 발사 자료(w)가 있지만 전투 화력이 아니다.
    const isGun = (item) => Boolean(item?.w) && item.type === 'WeaponGun';

    // 미사일 랙·폭탄 랙에 실리는 수와 크기.
    function rackLoad(item) {
        const ports = (item?.ports || []).filter((port) => (port.acc || []).some((rule) => rule.type === 'Missile' || rule.type === 'Bomb'));
        return { count: ports.length, size: ports.reduce((max, port) => Math.max(max, Number(port.max) || 0), 0) };
    }

    function weaponRange(item) {
        const w = item?.w;
        if (w?.kind === 'beam' && w.zeroRange) return Math.round(w.zeroRange);
        return w?.speed && w?.life ? Math.round(w.speed * w.life) : 0;
    }

    // 슬롯에 넣을 수 있는 부품인지 판정한다(게임의 장착 규칙을 단순화한 것).
    // - 종류(type, 필요하면 subType)가 슬롯이 받는 목록에 있어야 한다
    // - 크기가 슬롯의 최소~최대 범위 안이어야 한다
    // - 전용 부품(requiredTags)은 그 태그를 가진 함선·상위 부품에만 달 수 있다
    function fitsSlot(item, slot, context) {
        if (!item || !slot) return false;
        // Exclude temporary bomb-rack definitions from imports as well as the picker.
        if (item.type === 'BombLauncher' && /(?:^|_)TEMP(?:_|$)/i.test(item.cls || '')) return false;
        const size = Number(item.size) || 0;
        if (size < (slot.min ?? 0) || size > (slot.max ?? 99)) return false;
        const accepts = slot.acc || [];
        // Missing attachment rules are unknown, never an unrestricted socket.
        if (!accepts.length) return false;
        if (accepts.length) {
            const ok = accepts.some((rule) => rule.type === item.type && (!rule.subs?.length || !item.sub || rule.subs.includes(item.sub)));
            if (!ok) return false;
        }
        const required = item.req || [];
        if (required.length) {
            // 함선·상위 부품의 표지와 자리 자체의 표지를 함께 본다.
            const tags = new Set([...(context?.tags || []), ...(slot.tags || [])].map(normalizeTag));
            if (!required.some((tag) => tags.has(normalizeTag(tag)))) return false;
        }
        return true;
    }

    function normalizeTag(tag) {
        return String(tag || '').replace(/^\$/, '').toLowerCase();
    }

    // A port name is its persistent identity. Identical source entries describe
    // one socket; conflicting entries must be reviewed instead of inventing slots.
    function normalizeSlots(slots) {
        const unique = new Map();
        for (const source of slots || []) {
            const slot = { ...source };
            if (slot.ch) slot.ch = normalizeSlots(slot.ch);
            if (slot.kind === 's' && !slot.acc?.length) slot.kind = 'f';
            const previous = unique.get(slot.port);
            if (previous && JSON.stringify(previous) !== JSON.stringify(slot)) throw new Error(`Conflicting loadout port: ${slot.port}`);
            if (!previous) unique.set(slot.port, slot);
        }
        return [...unique.values()];
    }

    // 슬롯 트리를 돌며 현재 장착된 부품을 차례로 넘긴다.
    // overrides: { "<슬롯 경로>": "<부품 id>" | "" } — 기본 장착에서 바꾼 것만 담는다("" = 비움).
    function walkLoadout(ship, items, overrides, visit) {
        const lookup = (id) => (id ? items[id] || ship.extra?.[id] || null : null);
        const step = (slots, parentPath, state) => {
            for (const slot of slots || []) {
                const path = parentPath ? `${parentPath}/${slot.port}` : slot.port;
                const override = overrides && Object.hasOwn(overrides, path) ? overrides[path] : undefined;
                const itemId = override === undefined ? slot.item : override;
                const item = lookup(itemId);
                const changed = override !== undefined && override !== (slot.item || '');
                const next = { turret: state.turret, tags: item?.tags?.length ? [...state.tags, ...item.tags] : state.tags, depth: state.depth + 1 };
                // 유인 터렛과 문 기총(도어 거너)은 승무원이 쏘는 무장이다.
                if (item && (item.sub === 'MannedTurret' || item.type === 'TurretBase' || /(^|_)door(_|$)|gunner/i.test(slot.port || ''))) next.turret = true;
                visit({ slot, path, item, itemId: itemId || '', changed, turret: next.turret, tags: state.tags, depth: state.depth });
                // 부품을 바꾸면 그 아래에 달려 있던 기본 부품(예: 랙의 미사일)은 더 이상 유효하지 않다.
                // 새 부품이 가진 장착 자리(ports)를 빈 슬롯으로 펼쳐, 이어서 채울 수 있게 한다.
                // 바꿀 수 없는 내부 부속 자리(총열·전원부 등)는 채울 수 없는 빈자리라 펼치지 않는다 —
                // 펼치면 무기 한 정이 '하위 자리를 거느린 부품'처럼 보여 목록의 줄 구성이 달라진다.
                const children = changed
                    ? (item?.ports || []).filter((port) => port.ed !== false && port.acc?.some((rule) => componentTypes.has(rule.type))).map((port) => ({ port: port.name, kind: 's', min: port.min, max: port.max, acc: port.acc, tags: port.tags, item: '' }))
                    : slot.ch;
                step(children, path, next);
            }
        };
        step(ship.slots, '', { turret: false, tags: ship.tags || [], depth: 0 });
    }

    // A power budget, not a simulation of the engine's undocumented capacitor allocator.
    function powerPlan(ship, items, overrides, options = {}) {
        const groups = new Map();
        const off = Object.keys(options.off || {}).filter((key) => options.off[key]);
        const groupFor = (type) => ({ WeaponGun: 'weapons', Shield: 'shields', FlightController: 'engines', Radar: 'radar', Cooler: 'coolers', QuantumDrive: 'quantum', LifeSupportGenerator: 'lifeSupport', WeaponMining: 'mining', SalvageHead: 'utility', TractorBeam: 'utility', TowingBeam: 'utility' })[type] || 'other';
        const add = (type, min, max) => {
            if (!(max > 0) || !Number.isFinite(min)) return;
            const key = groupFor(type);
            const group = groups.get(key) || { key, min: 0, max: 0 };
            group.min += min; group.max += max; groups.set(key, group);
        };
        let generation = 0;
        const plants = [];
        walkLoadout(ship, items, overrides, ({ item, itemId, path }) => {
            if (!item || off.some((key) => path === key || path.startsWith(`${key}/`))) return;
            if (item.type === 'PowerPlant') {
                const output = Number(item.power?.gen);
                const supplied = Number.isFinite(output) ? Math.max(0, output) : 0;
                generation += supplied;
                plants.push({ item, itemId, path, generation: supplied });
            }
            if (item.powerLimits) add(item.type, item.powerLimits.min, item.powerLimits.max);
        });
        for (const item of ship.systems?.fixed || []) add(item.type, item.min, item.max);
        const order = ['weapons', 'engines', 'shields', 'radar', 'lifeSupport', 'coolers', 'quantum', 'mining', 'utility', 'other'];
        const rows = order.filter((key) => groups.has(key)).map((key) => {
            const group = groups.get(key);
            const pool = ship.systems?.pools?.find((p) => p.itemType === 'WeaponGun' && p.kind === 'FixedPowerPool');
            const max = key === 'weapons' && pool?.poolSize > 0 ? Math.min(Math.ceil(group.max), pool.poolSize) : Math.ceil(group.max - 1e-7);
            const min = Math.min(max, Math.ceil(group.min - 1e-7));
            const chosen = options.operation?.power?.[key];
            const allocated = Number.isFinite(chosen) ? Math.max(0, Math.min(max, Math.round(chosen))) : max;
            return { ...group, min, max, allocated: allocated > 0 ? Math.max(min, allocated) : 0 };
        });
        // Every displayed/saved plan fits the installed plants, including old links
        // and plans loaded after a smaller plant is installed. Keep zero allocations
        // and never raise an existing request when reducing an over-budget plan.
        const capacity = Math.floor(generation);
        if (rows.reduce((sum, row) => sum + row.allocated, 0) > capacity) {
            const bounded = autoPowerPlan({ generation: capacity, groups: rows.map((row) => ({ ...row, max: row.allocated, min: Math.min(row.min, row.allocated) })) });
            for (const row of rows) row.allocated = bounded[row.key];
        }
        const allocated = rows.reduce((sum, row) => sum + row.allocated, 0);
        return { groups: rows, plants, generation, capacity, allocated, remaining: capacity - allocated, maximum: rows.reduce((sum, row) => sum + row.max, 0) };
    }

    function autoPowerPlan(plan) {
        const power = Object.fromEntries(plan.groups.map((group) => [group.key, 0]));
        let spare = Math.floor(plan.generation);
        for (const group of plan.groups) if (group.min <= spare) { power[group.key] = group.min; spare -= group.min; }
        while (spare > 0) {
            let moved = false;
            for (const group of plan.groups) {
                const step = power[group.key] === 0 ? Math.max(1, group.min) : 1;
                if (power[group.key] < group.max && step <= spare) { power[group.key] += step; spare -= step; moved = true; }
            }
            if (!moved) break;
        }
        return power;
    }

    function sanitizeOperation(ship, items, overrides, input, options = {}) {
        const plan = powerPlan(ship, items, overrides, { ...options, operation: input });
        const explicit = plan.groups.some((group) => Number.isFinite(input?.power?.[group.key]));
        const power = explicit ? Object.fromEntries(plan.groups.map((group) => [group.key, group.allocated])) : {};
        const activeModules = {};
        walkLoadout(ship, items, overrides, ({ path, item }) => {
            if (input?.activeModules?.[path] === true && item?.miningModule?.activation === 'ActivateOnDemand') activeModules[path] = true;
        });
        return { power, activeModules };
    }

    // Direct source multipliers only. Two overlapping contributions do not establish
    // their composition rule, even if their individual FloatModifier types are known.
    function miningHeads(ship, items, overrides, options = {}) {
        const nodes = [];
        walkLoadout(ship, items, overrides, (node) => nodes.push(node));
        const off = Object.keys(options.off || {}).filter((key) => options.off[key]);
        const isOff = (path) => off.some((key) => path === key || path.startsWith(`${key}/`));
        return nodes.filter((node) => node.item?.miningHead).map((head) => {
            const modules = nodes.filter((node) => node.path.startsWith(`${head.path}/`) && node.item?.miningModule).map((node) => ({
                ...node, active: !isOff(node.path) && (node.item.miningModule.activation === 'ActivateOnAttach' || options.operation?.activeModules?.[node.path] === true),
            }));
            const active = modules.filter((node) => node.active);
            const channel = (key) => {
                const base = head.item.miningHead[key];
                const modifiers = active.map((node) => node.item.miningModule[key]).filter((value) => value !== 1);
                if (isOff(head.path)) return { base, value: 0, verified: true };
                if (!Number.isFinite(base) || modifiers.some((v) => !Number.isFinite(v)) || modifiers.length > 1) return { base, value: null, verified: false };
                return { base, value: base * (modifiers[0] ?? 1), verified: true };
            };
            return { ...head, modules, power: channel('power'), extraction: channel('extraction'), off: isOff(head.path) };
        });
    }

    function emptyTotals() {
        return {
            dps: { total: 0, pilot: 0, turret: 0, byType: {} },
            sustain: { total: 0, pilot: 0, turret: 0 },
            alpha: { total: 0, pilot: 0, turret: 0 },
            weapons: 0,
            missiles: { count: 0, damage: 0 },
            counter: { decoy: 0, noise: 0 },
            emp: null,
            dampener: null,
            shield: { hp: 0, regen: 0, count: 0 },
            power: { gen: 0, use: 0 },
            cooling: { gen: 0, use: 0 },
            quantum: null,
            signature: { em: 0, ir: 0 },
            mass: 0,
            changed: 0,
            off: 0,
        };
    }

    // 로드아웃 전체 요약: 화력·미사일·실드·동력·냉각·양자 항행·신호.
    // options.off: 전원을 꺼 둔 자리(경로 → true). 꺼진 부품과 그 아래 부품은 수치에 넣지 않는다.
    function summarize(ship, items, overrides, options) {
        const totals = emptyTotals();
        const offPaths = Object.keys(options?.off || {}).filter((key) => options.off[key]);
        const isOff = (path) => offPaths.some((key) => path === key || path.startsWith(`${key}/`));
        walkLoadout(ship, items, overrides, ({ item, itemId, changed, turret, path }) => {
            if (changed) totals.changed += 1;
            if (!item) return;
            totals.mass += Number(item.mass) || 0;
            if (offPaths.length && isOff(path)) { if (offPaths.includes(path)) totals.off += 1; return; }
            totals.power.gen += Number(item.power?.gen) || 0;
            totals.power.use += Number(item.power?.use) || 0;
            totals.cooling.gen += Number(item.cool?.gen) || 0;
            totals.cooling.use += Number(item.cool?.use) || 0;
            totals.signature.em += Number(item.em) || 0;
            totals.signature.ir += Number(item.ir) || 0;
            if (isGun(item)) {
                const stats = weaponStats(item);
                if (stats.dps || stats.alpha) {
                    totals.weapons += 1;
                    totals.dps.total += stats.dps;
                    totals.alpha.total += stats.alpha;
                    totals.dps[turret ? 'turret' : 'pilot'] += stats.dps;
                    const sustained = weaponSustain(item).dps;
                    totals.sustain.total += sustained;
                    totals.sustain[turret ? 'turret' : 'pilot'] += sustained;
                    totals.alpha[turret ? 'turret' : 'pilot'] += stats.alpha;
                    for (const [type, value] of Object.entries(stats.byType)) totals.dps.byType[type] = (totals.dps.byType[type] || 0) + value;
                }
            }
            // 디코이·노이즈: 발사기에 든 수량을 센다.
            if (item.type === 'WeaponDefensive' && item.w?.ammo) totals.counter[/chaff|noise/i.test(item.cls || '') ? 'noise' : 'decoy'] += item.w.ammo;
            if (item.emp && !totals.emp) totals.emp = { id: itemId, ...item.emp };
            if (item.qig && !totals.dampener) totals.dampener = { id: itemId, ...item.qig };
            if (item.ms) {
                totals.missiles.count += 1;
                totals.missiles.damage += sumDamage(item.ms.dmg);
            }
            if (item.sh) {
                totals.shield.count += 1;
                totals.shield.hp += Number(item.sh.hp) || 0;
                totals.shield.regen += Number(item.sh.regen) || 0;
            }
            if (item.qd && !totals.quantum) {
                totals.quantum = {
                    id: itemId, name: item.name,
                    speed: Number(item.qd.speed) || 0,
                    spool: Number(item.qd.spool) || 0,
                    cooldown: Number(item.qd.cool) || 0,
                    accel: Number(item.qd.s2) || Number(item.qd.s1) || 0,
                    fuelUse: Number(item.qd.fuel) || 0,
                    // 항속 거리(Gm): 퀀텀 연료 탱크 용량(SCU) ÷ 드라이브의 연료 요구량. 게임 파일 수치로 계산한 어림값.
                    range: ship.base?.fuel?.qt && Number(item.qd.fuel) ? ship.base.fuel.qt / Number(item.qd.fuel) : 0,
                };
            }
        });
        return totals;
    }

    // 퀀텀 이동 시간(초) 어림: 스풀링 → 가속 → 최고 속도 순항 → 감속.
    // 가속·감속을 같은 값으로 본 단순 계산이라 실제 게임과 조금 다를 수 있다.
    function quantumTravelTime(quantum, distanceGm) {
        const distance = (Number(distanceGm) || 0) * 1e9;
        const speed = Number(quantum?.speed) || 0;
        const accel = Number(quantum?.accel) || 0;
        if (!(distance > 0) || !Number.isFinite(distance) || !(speed > 0)) return 0;
        const spool = Number(quantum.spool) || 0;
        if (!accel) return spool + distance / speed;
        const rampDistance = speed * speed / accel;
        return spool + (distance >= rampDistance ? distance / speed + speed / accel : 2 * Math.sqrt(distance / accel));
    }

    // 공유용 문자열: 바꾼 슬롯만 "경로=부품id"로 이어 붙인다. 기본 장착은 담지 않는다.
    function encodeOverrides(overrides) {
        return Object.entries(overrides || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([path, id]) => `${encodeURIComponent(path)}=${encodeURIComponent(id)}`)
            .join('&');
    }

    function decodeOverrides(text) {
        const overrides = {};
        for (const pair of String(text || '').split('&')) {
            if (!pair) continue;
            const index = pair.indexOf('=');
            if (index <= 0) continue;
            try {
                overrides[decodeURIComponent(pair.slice(0, index))] = decodeURIComponent(pair.slice(index + 1));
            } catch (_error) { /* 깨진 공유 문자열은 건너뛴다 */ }
        }
        return overrides;
    }

    // 저장된 로드아웃이 현재 자료와 맞는지 확인하고, 맞지 않는 항목은 버린다.
    // 상위 슬롯부터 차례로 확인한다(상위 부품을 바꾸면 하위 슬롯 구성이 달라지기 때문).
    function sanitizeOverrides(ship, items, overrides) {
        const valid = {};
        const pending = Object.entries(overrides || {}).sort(([a], [b]) => a.split('/').length - b.split('/').length);
        for (const [path, id] of pending) {
            let entry = null;
            walkLoadout(ship, items, valid, (node) => { if (node.path === path) entry = node; });
            if (!entry || entry.slot.kind !== 's') continue;
            if (id === '') { valid[path] = ''; continue; }
            const item = items[id] || ship.extra?.[id];
            if (item && fitsSlot(item, entry.slot, { tags: entry.tags })) valid[path] = id;
        }
        return valid;
    }

    return { DAMAGE_TYPES, COMPONENT_TYPES, sumDamage, weaponStats, weaponSustain, weaponRange, isGun, rackLoad, fitsSlot, normalizeTag, normalizeSlots, walkLoadout, summarize, quantumTravelTime, encodeOverrides, decodeOverrides, sanitizeOverrides, powerPlan, autoPowerPlan, sanitizeOperation, miningHeads };
});
