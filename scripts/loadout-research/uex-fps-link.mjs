// 조사: 개인 장비(무기·부착물·방어구)를 UEX 와 대조해 잇는다.
//   node scripts/loadout-research/uex-fps-link.mjs --uex-dir <UEX 응답 폴더>
// 입력: data/loadout-research/fps-*.json (게임 원본에서 뽑은 것), UEX 의 items / items_prices / items_attributes (분류 1,2,3,4,5,17,18,24)
// 출력: data/loadout-research/uex-fps-links.json
// 규칙: 고유번호(UUID)가 같으면 verified, 이름만 같으면 name. 수치가 다르면 게임 파일 값을 따른다(소유자 결정 2026-11-18).
//       UEX 는 판매처·가격처럼 게임 파일에 없는 것에만 쓴다.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { args, requireDir, writeData, repoJson } from './lib.mjs';

const a = args();
const uexDir = requireDir(a['uex-dir'], 'uex-dir');
const CATEGORIES = { 1: 'arms', 2: 'backpack', 3: 'helmet', 4: 'legs', 5: 'torso', 24: 'undersuit', 17: 'attachment', 18: 'weapon' };
const read = (name) => { const file = resolve(uexDir, `${name}.json`); return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).data || [] : []; };
const norm = (value) => String(value || '').toLowerCase().replace(/&amp;/g, '&').replace(/[“”"']/g, '').replace(/[^a-z0-9]+/g, '');
// "26,400" 은 천 단위, "1,1" 은 소수점으로 읽는다.
function number(value) {
    const raw = String(value ?? '').replace(/[−–—]/g, '-').trim(); if (!raw || /^(null|n\s*\/?\s*a|\?+)/i.test(raw) || raw === '-') return undefined;
    const cleaned = raw.replace(/[+%x×]/gi, '').trim().replace(/,(\d{3})(?!\d)/g, '$1').replace(',', '.');
    const match = cleaned.match(/^-?\d+(\.\d+)?/); return match ? Number(match[0]) : undefined;
}

const game = [
    ...repoJson('data/loadout-research/fps-weapons.json').weapons.map((item) => ({ kind: 'weapon', ...item })),
    ...repoJson('data/loadout-research/fps-attachments.json').attachments.map((item) => ({ kind: 'attachment', ...item })),
    ...repoJson('data/loadout-research/fps-armor.json').armor.map((item) => ({ kind: item.slot, ...item })),
].filter((item) => !item.internal);
const byUuid = new Map(game.map((item) => [item.id.toLowerCase(), item]));
const byName = new Map(); for (const item of game) { const key = norm(item.name); byName.set(key, [...(byName.get(key) || []), item]); }

// 게임 값에서 UEX 속성과 견줄 수 있는 것만 뽑는다.
function gameValues(item) {
    if (item.kind === 'weapon') {
        const rates = (item.modes || []).map((mode) => mode.rpm).filter(Boolean);
        return { rateOfFire: rates.length ? Math.max(...rates) : undefined, magazineSize: item.magazineSize };
    }
    if (item.kind === 'attachment') return { magazineSize: item.magazineSize, };
    // 배율은 견주지 않는다: 원본의 zoomScale 이 제품 이름의 배율과 같은 값인지 확인하지 못했다.
    return {
        damageReduction: item.takes?.physical !== undefined ? Math.round((1 - item.takes.physical) * 100) : undefined,
        minTemperature: item.temperature?.[0], maxTemperature: item.temperature?.[1],
        radiationProtection: item.radiation?.capacity, radiationScrubRate: item.radiation?.dissipation, capacity: item.storageMicroSCU,
    };
}
const ATTRIBUTES = [
    [/^rate of fire/i, 'rateOfFire'], [/^magazine (size|cap)/i, 'magazineSize'],
    [/^damage reduction/i, 'damageReduction'], [/^min temperature/i, 'minTemperature'], [/^max temperature/i, 'maxTemperature'],
    [/^radiation protection/i, 'radiationProtection'], [/^radiation scrub rate/i, 'radiationScrubRate'], [/^(carrying )?capacity/i, 'capacity'],
];
const TOLERANCE = { radiationScrubRate: 0.05 };

const fetchedAt = {}; const links = []; const usedGame = new Set();
const stats = {}; const bump = (field, key) => { stats[field] = stats[field] || { same: 0, different: 0, uexMissing: 0 }; stats[field][key] += 1; };
for (const [category, kind] of Object.entries(CATEGORIES)) {
    const items = read(`items_${category}`); const prices = read(`prices_${category}`); const attributes = read(`items_attributes_${category}`);
    if (existsSync(resolve(uexDir, `prices_${category}.json`))) fetchedAt[category] = statSync(resolve(uexDir, `prices_${category}.json`)).mtime.toISOString();
    const shops = new Map(); for (const row of prices) { if (!(Number(row.price_buy) > 0)) continue; const entry = shops.get(row.id_item) || { count: 0, min: Infinity }; entry.count += 1; entry.min = Math.min(entry.min, Number(row.price_buy)); shops.set(row.id_item, entry); }
    const attrs = new Map(); for (const row of attributes) attrs.set(row.id_item, [...(attrs.get(row.id_item) || []), row]);
    for (const item of items) {
        let match = item.uuid ? byUuid.get(String(item.uuid).toLowerCase()) : undefined; let how = match ? 'verified' : 'none';
        if (!match) { const hits = byName.get(norm(item.name)) || []; if (hits.length === 1) { match = hits[0]; how = 'name'; } else if (hits.length > 1) how = 'ambiguous'; }
        const shop = shops.get(item.id);
        const entry = { uexId: item.id, uexCategory: kind, name: item.name, link: how, shops: shop?.count || 0, minPrice: shop ? shop.min : undefined };
        if (match) {
            usedGame.add(match.id); entry.cls = match.cls; entry.gameKind = match.kind; entry.gameName = match.name;
            const values = gameValues(match); const uexValues = {};
            for (const row of attrs.get(item.id) || []) { const field = ATTRIBUTES.find(([re]) => re.test(row.attribute_name))?.[1]; const value = number(row.value); if (field && value !== undefined && uexValues[field] === undefined) uexValues[field] = value; }
            const differences = [];
            for (const [field, value] of Object.entries(values)) {
                if (value === undefined) continue;
                let other = uexValues[field];
                if (other === undefined) { bump(field, 'uexMissing'); continue; }
                // UEX 가 용량을 SCU 로 적은 경우(8.0, 6.4 등)는 µSCU 로 맞춘다.
                if (field === 'capacity' && other < 1000 && value >= 1000) other *= 1000;
                if (Math.abs(other - value) <= (TOLERANCE[field] ?? 0.5)) bump(field, 'same');
                else { bump(field, 'different'); differences.push({ field, game: value, uex: other, adopted: value }); }
            }
            if (differences.length) entry.differences = differences;
        }
        links.push(entry);
    }
}
const count = (list, key) => list.reduce((out, row) => { out[row[key]] = (out[row[key]] || 0) + 1; return out; }, {});
const perKind = {};
for (const link of links) { const k = link.uexCategory; perKind[k] = perKind[k] || { uex: 0, linked: 0, withShops: 0, withDifferences: 0 }; perKind[k].uex += 1; if (link.cls) perKind[k].linked += 1; if (link.cls && link.shops) perKind[k].withShops += 1; if (link.differences) perKind[k].withDifferences += 1; }
const gameOnly = game.filter((item) => !usedGame.has(item.id));
writeData('uex-fps-links.json', {
    uexApi: 'https://api.uexcorp.uk/2.0', uexFetchedAt: fetchedAt,
    matchRule: 'UUID 가 같으면 verified, 이름만 같으면 name, 여러 개가 걸리면 ambiguous.',
    valuePolicy: '수치가 다르면 게임 파일 값을 따른다(differences[].adopted). UEX 는 판매처·가격에만 쓴다.',
    summary: { links: count(links, 'link'), perKind, fields: stats, gameItems: game.length, gameOnly: gameOnly.length, gameOnlyByKind: count(gameOnly, 'kind') },
    links, gameOnly: gameOnly.map((item) => ({ cls: item.cls, kind: item.kind, name: item.name, family: item.family })),
});
console.log(JSON.stringify({ links: count(links, 'link'), perKind, fields: stats, gameOnly: gameOnly.length }, null, 1));
