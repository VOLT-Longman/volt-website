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
const short = (ref) => (ref?.name ? String(ref.name).split('.').slice(1).join('.') : undefined);
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
const usedUex = new Set();
const commodityLinks = df.recordsOfType('ResourceType').map((record) => {
    const r = df.readRecord(record, 2); const id = record.name.split('.').slice(1).join('.'); const name = text(r.displayName);
    let match = uexByUuid.get(record.id.toLowerCase()); let how = match ? 'verified' : undefined;
    if (!match) { const list = uexByName.get(norm(name)) || uexByName.get(norm(id)) || []; if (list.length === 1) { match = list[0]; how = 'name'; } else if (list.length > 1) how = 'ambiguous'; }
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
    let scu = 0; const used = [];
    const walk = (list) => { for (const entry of list || []) { const cls = entry.entityClassName || String(entry.entityClassReference?.name || '').split('.').slice(1).join('.'); const grid = grids.get(cls.toLowerCase()); if (grid) { scu += grid.scu; used.push(grid.cls); } walk(entry.loadout?.entries); } };
    walk(entries);
    return { scu, grids: used };
}
const vehicleLinks = uex('vehicles').map((vehicle) => {
    const record = vehicle.uuid ? game.byId.get(String(vehicle.uuid).toLowerCase()) : undefined;
    if (!record) return { uexId: vehicle.id, name: vehicle.name_full || vehicle.name, link: 'none', uexScu: vehicle.scu };
    const cargo = shipCargo(record);
    return { uexId: vehicle.id, name: vehicle.name_full || vehicle.name, cls: game.clsOf(record), link: 'verified', uexScu: vehicle.scu, gameScu: cargo.scu, same: Number(vehicle.scu) === cargo.scu, grids: cargo.grids.length, uexBoxes: vehicle.container_sizes || undefined };
});

writeData('uex-world-links.json', {
    ...base, uexApi: 'https://api.uexcorp.uk/2.0', uexFetchedAt: Object.fromEntries(['commodities', 'planets', 'moons', 'space_stations', 'cities', 'outposts', 'vehicles'].map((n) => [n, fetchedAt(n)])),
    matchRule: 'UUID 가 같으면 verified, 이름만 같으면 name, 여러 개가 걸리면 ambiguous. name·ambiguous 는 사람이 확인하기 전에는 확정이 아니다.',
    summary: {
        commodities: count(commodityLinks, 'link'), uexOnlyCommodities: uexOnly.length,
        miningLocations: count(miningLinks, 'link'), places: count(placeLinks, 'link'),
        vehicles: { ...count(vehicleLinks, 'link'), sameScu: vehicleLinks.filter((v) => v.same).length, differentScu: vehicleLinks.filter((v) => v.link === 'verified' && !v.same).length },
    },
    commodities: commodityLinks, uexOnlyCommodities: uexOnly, miningLocations: miningLinks, places: placeLinks, vehicles: vehicleLinks,
});
