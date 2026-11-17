// UEX 15개 분류의 품목·판매 기록을 게임 추출 자료(data/loadout/items.json)와 전수 대조한다.
//   node scripts/loadout-research/uex-audit.mjs --cache-dir <게임 캐시> --uex-dir <UEX 응답 폴더> [--fetch]
// --fetch 를 주면 UEX 공개 API에서 items / items_prices 를 새로 받아 --uex-dir 에 저장한다.
// 결과: data/loadout-research/component-identities.json, shop-coverage.json
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { args, requireDir, loadGame, readJson, repoJson, writeData, manifestBase, OUT_DATA } from './lib.mjs';

const a = args();
const game = loadGame(requireDir(a['cache-dir'], 'cache-dir'));
const uexDir = a['uex-dir'];
if (!uexDir || uexDir === true) { console.error('--uex-dir <폴더> 가 필요합니다.'); process.exit(2); }
mkdirSync(uexDir, { recursive: true });

const API = 'https://api.uexcorp.uk/2.0';
const CATEGORIES = [19, 21, 22, 23, 29, 30, 32, 33, 34, 35, 67, 70, 83, 86, 110];
// 분류마다 게임 쪽에서 기대하는 부품 종류(AttachDef.Type).
const EXPECTED = {
    19: ['Cooler'], 21: ['PowerPlant'], 22: ['QuantumDrive'], 23: ['Shield'], 29: ['WeaponMining'], 30: ['MiningModifier'],
    32: ['WeaponGun'], 33: ['MissileLauncher', 'BombLauncher', 'GroundVehicleMissileLauncher'], 34: ['Missile'], 35: ['Turret', 'TurretBase', 'UtilityTurret'],
    67: ['TractorBeam', 'TowingBeam'], 70: ['Bomb'], 83: ['Radar'], 86: ['JumpDrive'], 110: ['SalvageHead', 'SalvageModifier'],
};
// 현재 사이트가 조회하는 분류 (functions/api/uex/loadout-prices.js 의 ALLOWED_CATEGORIES 와 js/loadout.js 의 UEX_CATEGORY).
const SITE_ALLOWED = [19, 21, 22, 23, 29, 32, 33, 34, 35, 70, 83, 86];

async function load(kind, category) {
    const file = resolve(uexDir, `${kind}_${category}.json`);
    if (a.fetch || !existsSync(file)) {
        const response = await fetch(`${API}/${kind === 'prices' ? 'items_prices' : 'items'}?id_category=${category}`);
        if (!response.ok) throw new Error(`UEX ${kind} ${category}: HTTP ${response.status}`);
        writeFileSync(file, await response.text());
    }
    const payload = readJson(file);
    if (!Array.isArray(payload.data)) throw new Error(`UEX ${kind} ${category}: 응답에 data 배열이 없습니다`);
    return payload.data;
}

const items = repoJson('data/loadout/items.json').items;
const norm = (name) => String(name || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const byName = new Map();
for (const [id, item] of Object.entries(items)) byName.set(norm(item.name), [...(byName.get(norm(item.name)) || []), id]);
const iso = (seconds) => (seconds ? new Date(seconds * 1000).toISOString() : null);
const sizeOf = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
const brief = (id) => ({ uuid: id, cls: items[id].cls, type: items[id].type, size: items[id].size ?? null, name: items[id].name, hidden: Boolean(items[id].hidden), variant: Boolean(items[id].variant), alias: items[id].alias || null });
const gameBrief = (uuid) => {
    const record = game.byId.get(uuid);
    if (!record) return null;
    const def = game.attach(game.entity(record, 6)) || {};
    return { uuid, cls: game.clsOf(record), type: def.Type ?? null, subType: def.SubType ?? null, size: def.Size ?? null, file: record.file };
};

const categories = [];
const coverage = [];
const noUuid = [];
const hiddenWithShops = [];
const uuidIssues = [];
const mismatches = [];
const uexUuids = new Set();
const fetchedAt = {};

for (const category of CATEGORIES) {
    const uexItems = await load('items', category);
    const prices = await load('prices', category);
    // 조회 시각 = 저장된 UEX 응답 파일의 수정 시각 (다시 대조만 돌려도 바뀌지 않는다).
    fetchedAt[category] = statSync(resolve(uexDir, `prices_${category}.json`)).mtime.toISOString();
    const shopsByItem = new Map();
    for (const row of prices) {
        if (!(Number(row.price_buy) > 0)) continue;
        const list = shopsByItem.get(row.id_item) || [];
        list.push({
            terminalId: row.id_terminal ?? null, terminal: row.terminal_name || null, terminalCode: row.terminal_code || null,
            place: row.city_name || row.space_station_name || row.outpost_name || row.moon_name || row.planet_name || null,
            system: row.star_system_name || null, priceBuy: Number(row.price_buy),
            priceUpdatedAt: iso(row.date_modified), priceGameVersion: row.game_version || null,
        });
        shopsByItem.set(row.id_item, list);
    }
    const summary = { category, name: uexItems[0]?.category || null, section: uexItems[0]?.section || null, expectedGameTypes: EXPECTED[category], queriedBySite: SITE_ALLOWED.includes(category), uexItems: uexItems.length, withUuid: 0, withoutUuid: 0, linkedByUuid: 0, linkedToHidden: 0, uuidInGameOnly: 0, uuidUnknown: 0, itemsWithShops: 0, shopRows: 0, itemsWithShopsUnlinked: 0 };
    for (const item of uexItems) {
        const shops = shopsByItem.get(item.id) || [];
        const uuid = typeof item.uuid === 'string' && item.uuid ? item.uuid.toLowerCase() : null;
        const size = sizeOf(item.size);
        const entry = { uexItemId: item.id, uexCategory: category, uexName: item.name, uexSize: size, uexCompany: item.company_name || null, uexGameVersion: item.game_version || null, uexItemUpdatedAt: iso(item.date_modified), uuid, link: null, shops };
        if (shops.length) { summary.itemsWithShops += 1; summary.shopRows += shops.length; }
        if (uuid) {
            summary.withUuid += 1; uexUuids.add(uuid);
            if (items[uuid]) {
                const target = items[uuid];
                const notes = [];
                // 이름: 한쪽이 다른 쪽을 포함하면 표기 차이(label-differs), 아니면 다른 물건일 수 있다(name-conflict).
                const bare = (name) => norm(name).replace(/[^a-z0-9]/g, '');
                const [x, y] = [bare(target.name), bare(item.name)];
                if (x !== y) notes.push(x.includes(y) || y.includes(x) ? 'label-differs' : 'name-conflict');
                // UEX 의 size 칸은 UUID·이름이 모두 맞는 부품에서도 자주 어긋난다 → 기록만 하고 연결 상태는 바꾸지 않는다.
                if (size !== null && target.size !== undefined && size !== Number(target.size)) notes.push('uex-size-differs');
                if (!EXPECTED[category].includes(target.type)) notes.push('type-outside-category');
                summary.linkedByUuid += 1;
                entry.link = { status: 'verified', basis: 'uuid', game: brief(uuid), representative: target.alias ? brief(target.alias) : null, notes };
                if (notes.includes('name-conflict') || notes.includes('type-outside-category')) entry.link.status = 'conflicting';
                if (notes.length) { mismatches.push({ uexItemId: item.id, uexCategory: category, uexName: item.name, uexSize: size, game: brief(uuid), notes, shops: shops.length }); }
                if (target.hidden) {
                    summary.linkedToHidden += 1;
                    if (shops.length) hiddenWithShops.push({ uexItemId: item.id, uexCategory: category, uexName: item.name, hidden: brief(uuid), representative: target.alias ? brief(target.alias) : null, representativeHasOwnUexRecord: null, shops: shops.length });
                }
            } else {
                const inGame = gameBrief(uuid);
                if (inGame) { summary.uuidInGameOnly += 1; entry.link = { status: 'unavailable', basis: 'uuid', reason: 'uuid-exists-in-game-but-not-in-loadout-items', game: inGame }; }
                else { summary.uuidUnknown += 1; entry.link = { status: 'unavailable', basis: 'uuid', reason: 'uuid-not-in-this-game-build', game: null }; }
                uuidIssues.push({ uexItemId: item.id, uexCategory: category, uexName: item.name, uexSize: size, uuid, reason: entry.link.reason, game: inGame, shops: shops.length });
                if (shops.length) summary.itemsWithShopsUnlinked += 1;
            }
        } else {
            summary.withoutUuid += 1;
            // 이름이 정확히 같고(대소문자·공백만 정규화) 종류가 분류와 맞는 후보만 모은다. 자동으로 연결하지 않는다.
            const candidates = (byName.get(norm(item.name)) || []).filter((id) => EXPECTED[category].includes(items[id].type)).map(brief);
            const sized = candidates.filter((c) => size === null || c.size === size);
            const visible = sized.filter((c) => !c.hidden);
            // UUID 가 없으면 확정할 수 없다(unavailable). 후보가 여럿이거나 규격이 어긋나면 conflicting.
            let status = 'unavailable'; let reason = 'no-exact-name-candidate';
            if (visible.length === 1) { reason = size === null ? 'single-exact-name-candidate-size-unknown' : 'single-exact-name-and-size-candidate'; }
            else if (visible.length > 1) { status = 'conflicting'; reason = 'several-exact-name-candidates'; }
            else if (sized.length) { status = 'conflicting'; reason = 'only-hidden-candidates'; }
            else if (candidates.length) { status = 'conflicting'; reason = 'exact-name-but-size-differs'; }
            entry.link = { status, basis: 'none', reason, candidates };
            noUuid.push({ uexItemId: item.id, uexCategory: category, uexName: item.name, uexSize: size, shops: shops.length, reason, candidates });
            if (shops.length) summary.itemsWithShopsUnlinked += 1;
        }
        coverage.push(entry);
    }
    categories.push(summary);
}

// 한 UUID 를 여러 UEX 품목이 함께 쓰는 경우 (이름이 다른 품목의 판매 기록이 엉뚱한 부품에 붙는다).
const sharedUuid = [];
const byUuid = new Map();
for (const c of coverage) if (c.uuid) byUuid.set(c.uuid, [...(byUuid.get(c.uuid) || []), c]);
for (const [uuid, list] of byUuid) {
    if (list.length < 2) continue;
    sharedUuid.push({ uuid, game: items[uuid] ? brief(uuid) : gameBrief(uuid), uexItems: list.map((c) => ({ uexItemId: c.uexItemId, uexCategory: c.uexCategory, uexName: c.uexName, uexSize: c.uexSize, shops: c.shops.length, notes: c.link.notes || [] })) });
    for (const c of list) { c.link.sharedUuidWith = list.filter((o) => o !== c).map((o) => o.uexItemId); }
}

// 숨긴 중복 항목: 대표 부품이 자기 UEX 기록(같은 UUID)을 따로 갖고 있는지 채운다.
for (const row of hiddenWithShops) {
    const rep = row.representative?.uuid;
    const own = rep ? coverage.find((c) => c.uuid === rep) : null;
    row.representativeHasOwnUexRecord = Boolean(own);
    row.representativeShops = own ? own.shops.length : 0;
}

// 게임 쪽에서 본 빈틈: 낱개로 사고파는 종류인데 UEX 에 같은 UUID 기록이 없는 부품.
const PRODUCT_TYPES = new Set(Object.values(EXPECTED).flat());
const typeToCategory = {};
for (const [category, types] of Object.entries(EXPECTED)) for (const type of types) typeToCategory[type] = Number(category);
const gameWithoutUex = [];
for (const [id, item] of Object.entries(items)) {
    if (!PRODUCT_TYPES.has(item.type) || item.hidden || item.name === item.cls) continue;
    if (uexUuids.has(id)) continue;
    const aliasCovered = Object.entries(items).some(([other, o]) => o.alias === id && uexUuids.has(other));
    const sameName = coverage.filter((c) => norm(c.uexName) === norm(item.name)).map((c) => ({ uexItemId: c.uexItemId, uexCategory: c.uexCategory, uexSize: c.uexSize, uuid: c.uuid, shops: c.shops.length }));
    gameWithoutUex.push({ ...brief(id), expectedUexCategory: typeToCategory[item.type], coveredThroughHiddenDuplicate: aliasCovered, uexRecordsWithSameName: sameName });
}

// 같은 이름·다른 규격/성능, 도색 변종, 함선 전용 변형.
const PAINT = /_(?:mr\d+|CleanAir|Shark|[A-Za-z]+_?(?:Paint|Skin|Livery)\w*|(?:black|white|grey|gold|red|blue|green|tan|pink|purple|orange|yellow|chrome|camo)\w*)$/i;
const nameGroups = [];
for (const ids of byName.values()) {
    const list = ids.filter((id) => PRODUCT_TYPES.has(items[id].type) && items[id].name !== items[id].cls);
    if (list.length < 2) continue;
    const sizes = new Set(list.map((id) => items[id].size ?? null));
    const types = new Set(list.map((id) => items[id].type));
    const strip = ({ cls: _c, alias: _a, hidden: _h, variant: _v, ...rest }) => JSON.stringify(rest);
    const stats = new Set(list.map((id) => strip(items[id])));
    nameGroups.push({
        name: items[list[0]].name, kind: sizes.size > 1 || types.size > 1 ? 'same-name-different-size-or-type' : stats.size > 1 ? 'same-name-different-stats' : 'identical-duplicates',
        members: list.map((id) => ({ ...brief(id), statsDifferFromFirst: strip(items[id]) !== strip(items[list[0]]), hasUexRecord: uexUuids.has(id) })),
    });
}
const paintVariants = [];
const byClass = new Map(Object.entries(items).map(([id, item]) => [item.cls.toLowerCase(), id]));
for (const [id, item] of Object.entries(items)) {
    if (!PRODUCT_TYPES.has(item.type)) continue;
    const base = item.cls.replace(PAINT, '');
    const parent = base !== item.cls ? byClass.get(base.toLowerCase()) : null;
    if (!parent || items[parent].type !== item.type || items[parent].size !== item.size) continue;
    const strip = ({ cls: _c, alias: _a, hidden: _h, variant: _v, name: _n, ...rest }) => JSON.stringify(rest);
    paintVariants.push({ ...brief(id), baseUuid: parent, baseCls: items[parent].cls, baseName: items[parent].name, statsIdenticalToBase: strip(item) === strip(items[parent]), hasUexRecord: uexUuids.has(id), baseHasUexRecord: uexUuids.has(parent) });
}
const shipVariants = Object.entries(items).filter(([, item]) => item.variant).map(([id]) => ({ ...brief(id), hasUexRecord: uexUuids.has(id) }));

const meta = { ...manifestBase(game), uexApi: API, uexFetchedAt: fetchedAt, itemsSource: 'data/loadout/items.json', matchRule: 'UUID 가 같을 때만 verified. 이름만 같은 후보는 conflicting 으로 두고 자동 연결하지 않는다.' };
const totals = {
    uexItems: coverage.length, withUuid: coverage.filter((c) => c.uuid).length, withoutUuid: noUuid.length,
    withoutUuidWithShops: noUuid.filter((n) => n.shops).length,
    linkedByUuid: coverage.filter((c) => c.link.basis === 'uuid' && c.link.game && c.link.status !== 'unavailable').length,
    uuidNotInLoadoutItems: uuidIssues.length, hiddenDuplicatesWithShops: hiddenWithShops.length,
    nameConflicts: mismatches.filter((m) => m.notes.includes('name-conflict')).length, nameConflictsWithShops: mismatches.filter((m) => m.notes.includes('name-conflict') && m.shops).length,
    labelDiffers: mismatches.filter((m) => m.notes.includes('label-differs')).length, uexSizeDiffers: mismatches.filter((m) => m.notes.includes('uex-size-differs')).length,
    typeOutsideCategory: mismatches.filter((m) => m.notes.includes('type-outside-category')).length, uuidsSharedBySeveralUexItems: sharedUuid.length,
    gameProductsWithoutUexRecord: gameWithoutUex.length, shopRows: coverage.reduce((n, c) => n + c.shops.length, 0),
    shopRowsUnlinked: coverage.filter((c) => c.link.status !== 'verified').reduce((n, c) => n + c.shops.length, 0),
};
writeData('component-identities.json', {
    meta, totals, categories,
    categoriesOutsideSiteQuery: categories.filter((c) => !c.queriedBySite).map((c) => ({ category: c.category, name: c.name, uexItems: c.uexItems, itemsWithShops: c.itemsWithShops, expectedGameTypes: c.expectedGameTypes })),
    uexItemsWithoutUuid: noUuid, uexUuidNotInLoadoutItems: uuidIssues, uuidLinkedButNameOrSizeDiffers: mismatches, uuidsSharedBySeveralUexItems: sharedUuid,
    hiddenDuplicatesWithShops: hiddenWithShops, gameProductsWithoutUexRecord: gameWithoutUex,
    sameNameGroups: nameGroups, paintVariants, shipSpecificVariants: shipVariants,
});
// 판매처 표는 품목 한 줄씩 적어 파일 크기를 줄인다.
mkdirSync(OUT_DATA, { recursive: true });
const head = JSON.stringify({ meta, totals: { items: coverage.length, itemsWithShops: coverage.filter((c) => c.shops.length).length, shopRows: totals.shopRows, shopRowsUnlinked: totals.shopRowsUnlinked } });
const slim = (c) => ({ ...c, link: { status: c.link.status, basis: c.link.basis, reason: c.link.reason, gameUuid: c.link.game?.uuid || null, gameCls: c.link.game?.cls || null, representativeUuid: c.link.representative?.uuid || null, notes: c.link.notes, candidates: c.link.candidates?.map((x) => x.uuid), sharedUuidWith: c.link.sharedUuidWith } });
writeFileSync(resolve(OUT_DATA, 'shop-coverage.json'), [`${head.slice(0, -1)},"items":[`, coverage.map((c) => JSON.stringify(slim(c))).join(',\n'), ']}', ''].join('\n'));
console.log('wrote data/loadout-research/shop-coverage.json');
console.log(JSON.stringify(totals, null, 1));
console.table(categories.map(({ expectedGameTypes: _e, section: _s, ...rest }) => rest));
