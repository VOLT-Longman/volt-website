#!/usr/bin/env node
/**
 * 로드아웃 편집기의 한국어 표기를 게임 한국어 패치(global.ini)에서 가져온다.
 *
 * 한국 이용자가 게임 안에서 보는 이름과 같아야 하므로, 임의로 번역하지 않고
 * 한국어 패치의 표기를 기준으로 삼는다(예: 퀀텀 드라이브, 파워 플랜트, 쿨러, 실드 제너레이터).
 *   - 함선 이름: vehicle_Name<ClassName>
 *   - 부품 이름: item_Name<ClassName>
 *   - 부품 종류: item_Type<Type>, item_SubType<SubType>
 *   - 제조사: manufacturer_Name<CODE>
 *   - 분류: ui_inventory_component_class_*
 * 패치에 없는 항목은 싣지 않는다 — 화면은 게임 원문(영문)으로 표시한다.
 *
 * 사용: node scripts/loadout/build-loadout-ko.mjs --ini "<...>/Localization/korean_(south_korea)/global.ini"
 * 결과: data/loadout/ko.json (data/loadout/items.json이 먼저 있어야 한다)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'data/loadout');
const iniArg = process.argv.indexOf('--ini');
if (iniArg === -1 || !process.argv[iniArg + 1]) {
    console.error('사용: node scripts/loadout/build-loadout-ko.mjs --ini <global.ini 경로>');
    process.exit(1);
}

const table = new Map();
for (const line of readFileSync(resolve(process.argv[iniArg + 1]), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim().replace(/,P$/i, '').toLowerCase();
    if (!table.has(key)) table.set(key, line.slice(index + 1).trim());
}
// 게임 문자열의 서식 표지와 "[English Name]" 병기를 걷어낸 표시용 이름.
const clean = (value) => String(value || '').replace(/\\n/g, ' ').replace(/\s*\[[^\]]*\]\s*$/, '').replace(/\s+/g, ' ').trim();
const lookup = (...keys) => {
    for (const key of keys) {
        const value = clean(table.get(key.toLowerCase()));
        if (value && !/^@|^<=/.test(value)) return value;
    }
    return '';
};

const { items, version } = JSON.parse(readFileSync(resolve(OUT, 'items.json'), 'utf8'));
// 게임이 실제로 쓰는 이름 문자열 열쇠(내부 변형·새 정의(_gs)도 원래 제품과 같은 열쇠를 가리킨다).
const nameKeys = (() => { try { return JSON.parse(readFileSync(resolve(OUT, 'namekeys.json'), 'utf8')); } catch (_error) { return { ships: {}, items: {} }; } })();
nameKeys.roles ||= {}; nameKeys.makers ||= {};
const names = {};
const types = {}; const subs = {}; const manufacturers = {};
const stats = { items: 0, named: 0 };
const itemKeys = (cls) => {
    const base = String(cls || '').toLowerCase();
    const bare = base.replace(/_scitem$/, '');
    return [`item_name${base}`, `item_name_${base}`, `item_name${bare}`, `item_name_${bare}`, `item_name${bare}_scitem`];
};
// 제조사: 게임이 쓰는 문자열 열쇠를 먼저 찾고, 없으면 제조사 코드로 찾는다.
const addMaker = (code) => {
    if (!code || manufacturers[code]) return;
    const label = lookup(...[nameKeys.makers[code]].filter(Boolean), `manufacturer_name${code}`);
    if (label) manufacturers[code] = label;
};
const collect = (id, item) => {
    stats.items += 1;
    const name = lookup(...[nameKeys.items[id]].filter(Boolean), ...itemKeys(item.cls));
    // 패치가 원문을 그대로 둔 항목은 따로 싣지 않는다.
    if (name && name !== item.name) { names[id] = name; stats.named += 1; }
    if (item.type && !types[item.type]) { const label = lookup(`item_type${item.type}`); if (label) types[item.type] = label; }
    if (item.sub && !subs[item.sub]) { const label = lookup(`item_subtype${item.sub}`); if (label) subs[item.sub] = label; }
    addMaker(item.mfrCode);
};
for (const [id, item] of Object.entries(items)) collect(id, item);

// 함선 이름도 패치 표기를 쓴다(함선DB 자료가 늦게 뜨거나 함선DB에 없는 함선도 한국어로 보이게).
const shipNames = {};
const roles = {};
for (const ship of JSON.parse(readFileSync(resolve(OUT, 'index.json'), 'utf8')).ships) {
    const name = lookup(...[nameKeys.ships[ship.cls]].filter(Boolean), `vehicle_name${ship.cls}`);
    if (name && name !== ship.name) shipNames[ship.cls] = name;
    addMaker(ship.mfrCode);
    // 역할(경전투기, 소규모 화물 …)도 패치 표기를 쓴다. 영문 역할명 → 한국어.
    if (ship.role && !roles[ship.role] && nameKeys.roles[ship.role]) { const label = lookup(nameKeys.roles[ship.role]); if (label && label !== ship.role) roles[ship.role] = label; }
}

const classes = {};
for (const [name, code] of [['Military', 'mil'], ['Civilian', 'civ'], ['Industrial', 'ind'], ['Stealth', 'ste'], ['Competition', 'com']]) {
    const label = lookup(`ui_inventory_component_class_${code}`);
    if (label) classes[name] = label;
}
// 화면 문구에 쓰는 낱말. 패치에서 찾지 못하면 뒤의 기본값을 쓴다.
const term = (fallback, ...keys) => lookup(...keys) || fallback;
const terms = {
    weapons: term('무기', 'hud_Label_Weapons'),
    missiles: term('미사일', 'hud_Missiles'),
    shields: term('실드', 'hud_Label_Shields'),
    size: term('크기', 'hud_Label_Size'),
    signature: term('시그니쳐', 'hud_scanning_signature_strength_title'),
    quantumFuel: term('퀀텀 연료', 'hud_Label_QuantumFuel'),
    spooling: term('스풀링', 'hud_Spooling'),
    regen: term('재생률', 'shop_ui_StatRegen'),
    rapid: term('연사', 'ui_weapons_firemode_rapid'),
};

const output = {
    source: '스타 시티즌 한국어 패치 (global.ini)',
    dataVersion: version,
    builtAt: new Date().toISOString(),
    counts: { items: stats.items, named: stats.named, ships: Object.keys(shipNames).length, types: Object.keys(types).length, manufacturers: Object.keys(manufacturers).length },
    names, ships: shipNames, roles, types, subs, classes, manufacturers, terms,
};
writeFileSync(resolve(OUT, 'ko.json'), `${JSON.stringify(output)}\n`);
console.log(`한국어 패치 표기: 함선 이름 ${Object.keys(shipNames).length}, 부품 이름 ${stats.named}/${stats.items}, 종류 ${output.counts.types}, 제조사 ${output.counts.manufacturers}`);
console.log(`종류: ${Object.entries(types).map(([key, value]) => `${key}=${value}`).join(', ')}`);
console.log(`분류: ${JSON.stringify(classes)} / 낱말: ${JSON.stringify(terms)}`);
