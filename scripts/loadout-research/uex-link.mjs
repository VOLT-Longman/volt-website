// 조사: 게임 원본에서 뽑은 자료를 UEX 자료와 대조해 잇는다.
//   node scripts/loadout-research/uex-link.mjs --cache-dir <게임 캐시> --uex-dir <UEX 응답 폴더>
// UEX 응답(commodities, planets, moons, space_stations, cities, outposts, vehicles)은 미리 받아 둔 파일을 읽는다.
// 연결 규칙: 고유번호(UUID)가 같으면 verified, 이름만 같으면 name, 둘 다 아니면 잇지 않는다.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { args, requireDir, loadGame, writeData, manifestBase, repoJson } from './lib.mjs';

const a = args();
const cacheDir = requireDir(a['cache-dir'], 'cache-dir');
const uexDir = requireDir(a['uex-dir'], 'uex-dir');
const game = loadGame(cacheDir);
const { df } = game;
const uex = (name) => JSON.parse(readFileSync(resolve(uexDir, `${name}.json`), 'utf8')).data || [];
const fetchedAt = (name) => statSync(resolve(uexDir, `${name}.json`)).mtime.toISOString();
const norm = (value) => String(value || '').toLowerCase().replace(/\(r\)/g, '(raw)').replace(/[^a-z0-9]+/g, '');
const ini = new Map();
for (const line of readFileSync(resolve(cacheDir, 'global.ini'), 'utf8').split(/\r?\n/)) {
    const at = line.indexOf('='); if (at < 1) continue;
    ini.set(line.slice(0, at).replace(/^﻿/, '').replace(/,P$/i, '').trim().toLowerCase(), line.slice(at + 1).trim());
}
const text = (key) => { if (!key || !String(key).startsWith('@')) return undefined; const value = ini.get(String(key).slice(1).toLowerCase()); return value && !/LOC_/.test(value) ? value : undefined; };
const base = manifestBase(game);

// ---- 1. 상품 ----------------------------------------------------------------
const uexCommodities = uex('commodities');
const uexByUuid = new Map(uexCommodities.filter((c) => c.uuid).map((c) => [String(c.uuid).toLowerCase(), c]));
const uexByName = new Map(); for (const c of uexCommodities) { const key = norm(c.name); uexByName.set(key, [...(uexByName.get(key) || []), c]); }
// 표기만 다른 상품(게임 id → UEX 이름). 뜻이 같다고 판단한 근거는 docs/loadout-research/uex-world-links.md 에 적는다.
const COMMODITY_ALIASES = { Raw_Ice: 'Ice (Raw)', RawSilicon: 'Silicon (Raw)', RawOuratite: 'Ouratite (Raw)', Lastaprene: 'Lastaphrene', ConstructionMaterialPowder: 'Construction Material Rubble', ConstructionMaterialChunks: 'Construction Material Salvage' };
const usedUex = new Set();
const commodityLinks = df.recordsOfType('ResourceType').map((record) => {
    const r = df.readRecord(record, 2); const id = record.name.split('.').slice(1).join('.'); const name = text(r.displayName);
    let match = uexByUuid.get(record.id.toLowerCase()); let how = match ? 'verified' : undefined;
    if (!match) { const list = uexByName.get(norm(name)) || uexByName.get(norm(id)) || []; if (list.length === 1) { match = list[0]; how = 'name'; } else if (list.length > 1) how = 'ambiguous'; }
    if (!match && COMMODITY_ALIASES[id]) { const list = uexByName.get(norm(COMMODITY_ALIASES[id])) || []; if (list.length === 1) { match = list[0]; how = 'alias'; } }
    if (match) usedUex.add(match.id);
    return { id, uuid: record.id, name, link: how || 'none', uex: match ? { id: match.id, name: match.name, code: match.code, kind: match.kind, illegal: Boolean(match.is_illegal), raw: Boolean(match.is_raw), buyable: Boolean(match.is_buyable), sellable: Boolean(match.is_sellable), priceBuy: match.price_buy || undefined, priceSell: match.price_sell || undefined } : undefined };
});
const uexOnly = uexCommodities.filter((c) => !usedUex.has(c.id)).map((c) => ({ id: c.id, name: c.name, code: c.code, kind: c.kind, visible: Boolean(c.is_visible), available: Boolean(c.is_available_live) }));
const count = (list, key) => list.reduce((out, row) => { out[row[key]] = (out[row[key]] || 0) + 1; return out; }, {});

// ---- 2. 천체: 채광 장소와 지도 ------------------------------------------------
const bodies = [...uex('planets').map((p) => ({ kind: 'planet', ...p })), ...uex('moons').map((m) => ({ kind: 'moon', ...m }))];
const bodyByName = new Map(bodies.map((b) => [norm(b.name), b]));
const starmap = new Map(df.recordsOfType('StarMapObject').map((record) => [record.name.split('.').slice(1).join('.').toLowerCase(), record]));
const mining = repoJson('data/loadout-research/mining-profiles.json');
const miningLinks = mining.locations.map((location) => {
    const key = location.id.replace(/^HPP_/, '');
    const record = starmap.get(key.toLowerCase());
    const gameName = record ? text(df.readRecord(record, 2).name) : undefined;
    const body = gameName ? bodyByName.get(norm(gameName)) : undefined;
    return { id: location.id, starMapObject: record ? key : undefined, name: gameName, link: body ? 'name' : 'none', uex: body ? { kind: body.kind, id: body.id, name: body.name, system: body.star_system_name, planet: body.planet_name } : undefined };
});

// ---- 3. 거점 ----------------------------------------------------------------
const places = [...uex('space_stations').map((p) => ({ kind: 'space_station', ...p })), ...uex('cities').map((p) => ({ kind: 'city', ...p })), ...uex('outposts').map((p) => ({ kind: 'outpost', ...p }))];
const gameNames = new Map();
for (const [key, record] of starmap) { const name = text(df.readRecord(record, 2).name); if (name) gameNames.set(norm(name), [...(gameNames.get(norm(name)) || []), key]); }
const placeLinks = places.map((place) => {
    const hits = gameNames.get(norm(place.name)) || gameNames.get(norm(place.nickname)) || [];
    return { kind: place.kind, id: place.id, name: place.name, system: place.star_system_name, link: hits.length === 1 ? 'name' : hits.length > 1 ? 'ambiguous' : 'none', starMapObjects: hits.slice(0, 4), refinery: Boolean(place.has_refinery), cargoCenter: Boolean(place.has_cargo_center), tradeTerminal: Boolean(place.has_trade_terminal) };
});

// ---- 4. 함선 적재량 ----------------------------------------------------------
const grids = new Map(repoJson('data/loadout-research/cargo-grids.json').grids.map((g) => [g.cls.toLowerCase(), g]));
function shipCargo(record) {
    const entity = game.entity(record, 12);
    const entries = game.component(entity, 'SEntityComponentDefaultLoadoutParams')?.loadout?.entries || [];
    let scu = 0; let personal = 0; const used = [];
    // 화물칸은 함선에 바로 달리기도 하고, 화물 선반·문·승강기 같은 중간 부품의 기본 장착 안에 들어 있기도 하다.
    // 항목에 하위 장착이 적혀 있으면 그것을, 없으면 그 부품 자신의 기본 장착을 따라간다.
    const walk = (list, depth) => {
        for (const entry of list || []) {
            const cls = entry.entityClassName || String(entry.entityClassReference?.name || '').split('.').slice(1).join('.');
            const grid = grids.get(cls.toLowerCase());
            // 개인 보관함(무기고 등)은 화물 적재량에 넣지 않고 따로 센다.
            if (grid && /PersonalInventory/i.test(grid.container || '')) personal += grid.scu;
            else if (grid) { scu += grid.scu; used.push(grid.cls); }
            const nested = entry.loadout?.entries || [];
            if (nested.length) walk(nested, depth + 1);
            else if (cls && !grid && depth < 4) {
                const child = game.byClass.get(cls.toLowerCase());
                const own = child ? game.component(game.entity(child, 12), 'SEntityComponentDefaultLoadoutParams')?.loadout?.entries : null;
                if (own?.length) walk(own, depth + 1);
            }
        }
    };
    walk(entries, 0);
    return { scu, personal, grids: used };
}
// 게임 함선의 영어 이름 → 레코드. 같은 이름이 둘 이상이면 잇지 않는다.
const shipByName = new Map();
for (const record of game.records) {
    if (!/\/entities\/(spaceships|groundvehicles)\//.test(record.file)) continue;
    const params = game.component(game.entity(record, 4), 'VehicleComponentParams');
    const name = text(params?.vehicleName);
    if (name) shipByName.set(norm(name), [...(shipByName.get(norm(name)) || []), record]);
}
const vehicleLinks = uex('vehicles').map((vehicle) => {
    let record = vehicle.uuid ? game.byId.get(String(vehicle.uuid).toLowerCase()) : undefined;
    let how = record ? 'verified' : 'none';
    if (!record) {
        const hits = shipByName.get(norm(vehicle.name_full)) || shipByName.get(norm(vehicle.name)) || [];
        // 같은 이름의 정의가 여럿이면(AI·임무용 복사본) 클래스명이 가장 짧은 기본형 하나만 고른다. 가장 짧은 것이 둘이면 잇지 않는다.
        const sorted = [...hits].sort((x, y) => game.clsOf(x).length - game.clsOf(y).length);
        if (sorted.length === 1 || (sorted.length > 1 && game.clsOf(sorted[0]).length < game.clsOf(sorted[1]).length)) { record = sorted[0]; how = 'name'; } else if (sorted.length > 1) how = 'ambiguous';
    }
    if (!record) return { uexId: vehicle.id, name: vehicle.name_full || vehicle.name, link: how, uexScu: vehicle.scu, concept: Boolean(vehicle.is_concept) || undefined };
    const cargo = shipCargo(record);
    return { uexId: vehicle.id, name: vehicle.name_full || vehicle.name, cls: game.clsOf(record), link: how, uexScu: vehicle.scu, gameScu: cargo.scu, same: Number(vehicle.scu) === cargo.scu, grids: cargo.grids.length, personalScu: cargo.personal || undefined,
        // 수치가 다르면 게임 파일을 따른다(소유자 결정 2026-11-18). 단, 화물칸을 하나도 읽지 못한 0은 게임 값이 아니라 추출 누락이다.
        basis: Number(vehicle.scu) === cargo.scu ? 'same' : cargo.grids.length ? 'game' : 'unread', adoptedScu: Number(vehicle.scu) === cargo.scu || cargo.grids.length ? cargo.scu : undefined, uexBoxes: vehicle.container_sizes || undefined };
});

writeData('uex-world-links.json', {
    ...base, uexApi: 'https://api.uexcorp.uk/2.0', uexFetchedAt: Object.fromEntries(['commodities', 'planets', 'moons', 'space_stations', 'cities', 'outposts', 'vehicles'].map((n) => [n, fetchedAt(n)])),
    valuePolicy: '수치가 다르면 게임 파일 값을 따른다. basis=game 은 게임 값을 채택한 것, basis=unread 는 게임 쪽 화물칸을 읽지 못해 아직 정하지 못한 것.',
    matchRule: 'UUID 가 같으면 verified, 이름만 같으면 name, 여러 개가 걸리면 ambiguous. name·ambiguous 는 사람이 확인하기 전에는 확정이 아니다.',
    summary: {
        commodities: count(commodityLinks, 'link'), uexOnlyCommodities: uexOnly.length,
        miningLocations: count(miningLinks, 'link'), places: count(placeLinks, 'link'),
        vehicles: { ...count(vehicleLinks, 'link'), sameScu: vehicleLinks.filter((v) => v.same).length, differentScu: vehicleLinks.filter((v) => v.cls && !v.same).length, gameWins: vehicleLinks.filter((v) => v.basis === 'game').length, unread: vehicleLinks.filter((v) => v.basis === 'unread').length },
    },
    commodities: commodityLinks, uexOnlyCommodities: uexOnly, miningLocations: miningLinks, places: placeLinks, vehicles: vehicleLinks,
});
