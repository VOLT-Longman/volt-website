/**
 * VOLT 로드아웃 계산 계층 (순수 함수).
 *
 * 화면(js/loadout.js)과 자료 생성 스크립트(scripts/loadout/build-loadout-data.mjs),
 * 서버 테스트가 같은 계산식을 쓰도록 DOM에 의존하지 않는다. 브라우저에서는
 * window.VOLT_LOADOUT_CALC, Node에서는 module.exports로 노출한다.
 *
 * 입력 자료 형식은 data/loadout/items.json · data/loadout/ships/<id>.json 이다
 * (출처: Erkul Games LIVE 카탈로그, 구매처·가격: UEX).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.VOLT_LOADOUT_CALC = api;
})(typeof window !== 'undefined' ? window : null, () => {
    'use strict';

    const DAMAGE_TYPES = ['physical', 'energy', 'distortion', 'thermal', 'biochemical', 'stun'];

    function sumDamage(damage) {
        return DAMAGE_TYPES.reduce((total, type) => total + (Number(damage?.[type]) || 0), 0);
    }

    // 무기 1정의 1발 피해(alpha)와 초당 피해(dps).
    // - single/rapid/burst: 1발 피해 × 분당 발사 수 ÷ 60
    // - charged(완충 후 발사): 1발 피해 ÷ (충전 시간 + 재사용 대기)
    // - beam: 자료에 적힌 초당 피해를 그대로 쓴다
    function weaponStats(item) {
        const w = item?.w;
        if (!w) return { alpha: 0, dps: 0, byType: {} };
        const perShot = {};
        for (const type of DAMAGE_TYPES) {
            const value = (Number(w.dmg?.[type]) || 0) * (w.pellets || 1) * (w.mult ?? 1);
            if (value) perShot[type] = value;
        }
        const alpha = Object.values(perShot).reduce((a, b) => a + b, 0);
        let shotsPerSecond;
        if (w.kind === 'beam') {
            const beamDps = sumDamage(w.beamDps);
            const share = {};
            for (const type of DAMAGE_TYPES) if (w.beamDps?.[type]) share[type] = Number(w.beamDps[type]);
            return { alpha: 0, dps: beamDps, byType: share };
        }
        if (w.kind === 'charged' && (w.charge || w.cooldown)) shotsPerSecond = 1 / ((w.charge || 0) + (w.cooldown || 0));
        else shotsPerSecond = (w.rpm || 0) / 60;
        const byType = {};
        for (const [type, value] of Object.entries(perShot)) byType[type] = value * shotsPerSecond;
        return { alpha, dps: alpha * shotsPerSecond, byType };
    }

    function weaponRange(item) {
        const w = item?.w;
        return w?.speed && w?.life ? Math.round(w.speed * w.life) : 0;
    }

    // 슬롯에 넣을 수 있는 부품인지 판정한다(게임의 장착 규칙을 단순화한 것).
    // - 종류(type, 필요하면 subType)가 슬롯이 받는 목록에 있어야 한다
    // - 크기가 슬롯의 최소~최대 범위 안이어야 한다
    // - 전용 부품(requiredTags)은 그 태그를 가진 함선·상위 부품에만 달 수 있다
    function fitsSlot(item, slot, context) {
        if (!item || !slot) return false;
        const size = Number(item.size) || 0;
        if (size < (slot.min ?? 0) || size > (slot.max ?? 99)) return false;
        const accepts = slot.acc || [];
        if (accepts.length) {
            const ok = accepts.some((rule) => rule.type === item.type && (!rule.subs?.length || !item.sub || rule.subs.includes(item.sub)));
            if (!ok) return false;
        }
        const required = item.req || [];
        if (required.length) {
            const tags = new Set((context?.tags || []).map(normalizeTag));
            if (!required.some((tag) => tags.has(normalizeTag(tag)))) return false;
        }
        return true;
    }

    function normalizeTag(tag) {
        return String(tag || '').replace(/^\$/, '').toLowerCase();
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
                if (item && (item.sub === 'MannedTurret' || item.type === 'TurretBase')) next.turret = true;
                visit({ slot, path, item, itemId: itemId || '', changed, turret: next.turret, tags: state.tags, depth: state.depth });
                // 부품을 바꾸면 그 아래에 달려 있던 기본 부품(예: 랙의 미사일)은 더 이상 유효하지 않다.
                // 새 부품이 가진 장착 자리(ports)를 빈 슬롯으로 펼쳐, 이어서 채울 수 있게 한다.
                const children = changed
                    ? (item?.ports || []).map((port) => ({ port: port.name, kind: port.ed === false ? 'f' : 's', min: port.min, max: port.max, acc: port.acc, item: '' }))
                    : slot.ch;
                step(children, path, next);
            }
        };
        step(ship.slots, '', { turret: false, tags: ship.tags || [], depth: 0 });
    }

    function emptyTotals() {
        return {
            dps: { total: 0, pilot: 0, turret: 0, byType: {} },
            alpha: { total: 0, pilot: 0, turret: 0 },
            weapons: 0,
            missiles: { count: 0, damage: 0 },
            shield: { hp: 0, regen: 0, count: 0 },
            power: { gen: 0, use: 0 },
            cooling: { gen: 0, use: 0 },
            quantum: null,
            signature: { em: 0, ir: 0 },
            mass: 0,
            changed: 0,
        };
    }

    // 로드아웃 전체 요약: 화력·미사일·실드·동력·냉각·양자 항행·신호.
    function summarize(ship, items, overrides) {
        const totals = emptyTotals();
        walkLoadout(ship, items, overrides, ({ item, changed, turret }) => {
            if (changed) totals.changed += 1;
            if (!item) return;
            totals.mass += Number(item.mass) || 0;
            totals.power.gen += Number(item.power?.gen) || 0;
            totals.power.use += Number(item.power?.use) || 0;
            totals.cooling.gen += Number(item.cool?.gen) || 0;
            totals.cooling.use += Number(item.cool?.use) || 0;
            totals.signature.em += Number(item.em) || 0;
            totals.signature.ir += Number(item.ir) || 0;
            if (item.w) {
                const stats = weaponStats(item);
                if (stats.dps || stats.alpha) {
                    totals.weapons += 1;
                    totals.dps.total += stats.dps;
                    totals.alpha.total += stats.alpha;
                    totals.dps[turret ? 'turret' : 'pilot'] += stats.dps;
                    totals.alpha[turret ? 'turret' : 'pilot'] += stats.alpha;
                    for (const [type, value] of Object.entries(stats.byType)) totals.dps.byType[type] = (totals.dps.byType[type] || 0) + value;
                }
            }
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
                    name: item.name,
                    speed: Number(item.qd.speed) || 0,
                    spool: Number(item.qd.spool) || 0,
                    cooldown: Number(item.qd.cool) || 0,
                    // 항속 거리는 싣지 않는다: 연료량÷요구량으로 구한 값이 원본 계산값과 맞지 않아
                    // (179척 중 11척만 일치) 검증되기 전까지 틀린 숫자를 보여주지 않는다.
                };
            }
        });
        return totals;
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

    return { DAMAGE_TYPES, sumDamage, weaponStats, weaponRange, fitsSlot, normalizeTag, walkLoadout, summarize, encodeOverrides, decodeOverrides, sanitizeOverrides };
});
