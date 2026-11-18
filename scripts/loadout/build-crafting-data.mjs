#!/usr/bin/env node
/**
 * 로드아웃 부품의 제작 재료 — 설치된 게임 파일의 제작 설계도(CraftingBlueprintRecord)에서 뽑는다.
 *
 * 입력(--cache-dir): Game2.dcb, global.ini(영어).  선택: --ko-ini <한국어 패치 global.ini>
 * 출력: data/loadout/crafting.json  (로드아웃 자료에 있는 부품의 설계도만 싣는다)
 * 사용: node scripts/loadout/build-crafting-data.mjs --cache-dir <폴더> [--ko-ini <경로>]
 * 외부 서비스에 접근하지 않는다. 값은 게임 파일 그대로이며 게임 안에서 확인한 값이 아니다.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataForge } from '../gamedata/dataforge.mjs';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
const CACHE = arg('--cache-dir');
if (!CACHE || !existsSync(resolve(CACHE, 'Game2.dcb'))) { console.error('--cache-dir <Game2.dcb 가 있는 폴더> 가 필요합니다.'); process.exit(2); }
const df = new DataForge(readFileSync(resolve(CACHE, 'Game2.dcb')));
function loadIni(path) {
    const map = new Map();
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) { const at = line.indexOf('='); if (at > 0) map.set(line.slice(0, at).replace(/^﻿/, '').replace(/,P$/i, '').trim().toLowerCase(), line.slice(at + 1).trim()); }
    return map;
}
const en = loadIni(resolve(CACHE, 'global.ini'));
const koPath = arg('--ko-ini');
const ko = koPath && existsSync(koPath) ? loadIni(koPath) : null;
const lookup = (map, key) => { if (!map || !key || !String(key).startsWith('@')) return undefined; const value = map.get(String(key).slice(1).toLowerCase()); return value && !/LOC_|PLACEHOLDER/.test(value) ? value.replace(/<[^>]+>/g, '').trim() : undefined; };
const names = (key, fallback) => { const english = lookup(en, key) || fallback; const korean = lookup(ko, key); return korean && korean !== english ? { en: english, ko: korean } : { en: english }; };
const short = (ref) => (ref?.name ? String(ref.name).split('.').slice(1).join('.') : undefined);
const idOf = (record) => record.name.split('.').slice(1).join('.');
const round = (value, digits = 3) => Number(Number(value).toFixed(digits));
function findAll(value, test, out = []) {
    if (Array.isArray(value)) { for (const item of value) findAll(item, test, out); return out; }
    if (value && typeof value === 'object') { if (test(value)) out.push(value); for (const item of Object.values(value)) findAll(item, test, out); }
    return out;
}

const { items } = JSON.parse(readFileSync(resolve(ROOT, 'data/loadout/items.json'), 'utf8'));
const loadoutClasses = new Set(Object.values(items).map((item) => item.cls.toLowerCase()));
const resourceTypes = new Map(df.recordsOfType('ResourceType').map((record) => [idOf(record), df.readRecord(record, 2)]));
const entities = new Map(df.recordsOfType('EntityClassDefinition').map((record) => [idOf(record).toLowerCase(), record]));
// 손 채광 원석 같은 낱개 재료: 엔티티 이름 대신 같은 이름의 상품 표기를 쓴다(예: Harvestable_Mineral_1H_Hadanite → Hadanite).
const itemResource = (cls) => { const tail = String(cls).split('_').pop(); return resourceTypes.has(tail) ? tail : undefined; };

const recipes = {}; const resources = {};
const useResource = (id) => { if (!resources[id]) resources[id] = names(resourceTypes.get(id)?.displayName, id); return id; };
for (const record of df.recordsOfType('CraftingBlueprintRecord')) {
    const blueprint = df.readRecord(record, 14).blueprint || {};
    const output = short(blueprint.processSpecificData?.entityClass);
    if (!output || !loadoutClasses.has(output.toLowerCase())) continue;
    const costs = blueprint.tiers?.[0]?.recipe?.costs || {};
    const time = costs.craftTime || {};
    const seconds = (time.days || 0) * 86400 + (time.hours || 0) * 3600 + (time.minutes || 0) * 60 + (time.seconds || 0);
    const materials = findAll(costs, (node) => node.resource?.name && node.quantity).map((node) => [useResource(short(node.resource)), round(node.quantity.standardCargoUnits ?? (node.quantity.microSCU || 0) / 1e6)]);
    const pieces = findAll(costs, (node) => node.entityClass?.name && typeof node.quantity === 'number' && !node.resource).map((node) => {
        const cls = short(node.entityClass); const resource = itemResource(cls);
        if (resource) return [useResource(resource), node.quantity];
        const entity = entities.get(cls.toLowerCase());
        const key = entity ? (df.readRecord(entity, 6).Components || []).find((c) => c?.__type === 'SAttachableComponentParams')?.AttachDef?.Localization?.Name : null;
        resources[cls] = names(key, cls);
        return [cls, node.quantity];
    });
    if (!materials.length && !pieces.length) continue;
    recipes[output] = { blueprint: idOf(record), tier: 0, s: seconds || undefined, m: materials.length ? materials : undefined, p: pieces.length ? pieces : undefined };
}
const build = JSON.parse(readFileSync(resolve(CACHE, 'build.json'), 'utf8'));
const mining = JSON.parse(readFileSync(resolve(ROOT, 'data/mining/mining.json'), 'utf8'));
if (mining.gameVersion !== build.Version) throw new Error('Mining and crafting game builds must match. Rebuild mining data first.');
const miningResources = [...new Set(mining.minerals.flatMap((mineral) => [mineral.id, mineral.refined?.id]).filter((id) => id && resources[id]))];
const out = { version: `${String(build.Branch || '').replace(/^sc-alpha-/, '')}.${build.RequestedP4ChangeNum || ''}`, gameVersion: build.Version, source: 'game-files', sourceHash: createHash('sha256').update(df.buffer).digest('hex'), builtAt: new Date().toISOString(), note: '설계도 첫 단계(tier 0)만 포함. m = [상품, SCU], p = [낱개 재료, 개수], s = 제작 시간(초). 게임 파일 값.', miningResources, resources, recipes };
writeFileSync(resolve(ROOT, 'data/loadout/crafting.json'), `${JSON.stringify(out)}\n`);
console.log(`제작 재료: 설계도 ${Object.keys(recipes).length}개, 재료 ${Object.keys(resources).length}종, ${Math.round(JSON.stringify(out).length / 1024)}KB`);
