#!/usr/bin/env node
/**
 * 채광 안내용 자료 생성 — 설치된 게임 파일에서 직접 뽑는다.
 *
 * 입력(읽기 전용, --cache-dir 폴더): Game2.dcb, global.ini(영어), build.json
 *   선택: --ko-ini <한국어 패치 global.ini>  (없으면 한글 이름을 비워 둔다)
 * 출력: data/mining/mining.json
 *
 * 사용: node scripts/mining/build-mining-data.mjs --cache-dir <폴더> [--ko-ini <경로>]
 * 외부 서비스에 접근하지 않는다. 시세는 화면이 UEX 프록시로 따로 조회한다.
 *
 * 연결 고리: 장소별 채집 목록(HarvestableProviderPreset) → 암석(EntityClassDefinition.MineableParams.composition)
 *   → 암석 구성(MineableComposition) → 광물(MineableElement.resourceType) → 정제 상품(ResourceType.refinedVersion)
 * 비중·함량은 게임 파일의 값이다. 게임 안에서 실측한 출현율이 아니다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataForge } from '../gamedata/dataforge.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
const CACHE = arg('--cache-dir');
if (!CACHE || !existsSync(resolve(CACHE, 'Game2.dcb'))) { console.error('--cache-dir <Game2.dcb 가 있는 폴더> 가 필요합니다.'); process.exit(2); }

const df = new DataForge(readFileSync(resolve(CACHE, 'Game2.dcb')));
const build = JSON.parse(readFileSync(resolve(CACHE, 'build.json'), 'utf8'));
function loadIni(path) {
    const map = new Map();
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const at = line.indexOf('='); if (at < 1) continue;
        map.set(line.slice(0, at).replace(/^﻿/, '').replace(/,P$/i, '').trim().toLowerCase(), line.slice(at + 1).trim());
    }
    return map;
}
const en = loadIni(resolve(CACHE, 'global.ini'));
const koPath = arg('--ko-ini');
const ko = koPath && existsSync(koPath) ? loadIni(koPath) : null;
const lookup = (map, key) => { if (!map || !key || !String(key).startsWith('@')) return undefined; const value = map.get(String(key).slice(1).toLowerCase()); return value && !/LOC_|PLACEHOLDER/.test(value) ? value.replace(/<[^>]+>/g, '').trim() : undefined; };
const names = (key) => { const english = lookup(en, key); const korean = lookup(ko, key); return english ? (korean && korean !== english ? { en: english, ko: korean } : { en: english }) : undefined; };

const short = (ref) => (ref?.name ? String(ref.name).split('.').slice(1).join('.') : undefined);
const idOf = (record) => record.name.split('.').slice(1).join('.');
const round = (value, digits = 1) => (Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : undefined);
const prune = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
const component = (entity, type) => (entity.Components || []).find((c) => c && c.__type === type);

// ---- 상품과 광물 -------------------------------------------------------------
const resourceTypes = new Map(df.recordsOfType('ResourceType').map((record) => [idOf(record), df.readRecord(record, 3)]));
const elements = new Map(df.recordsOfType('MineableElement').map((record) => [idOf(record), df.readRecord(record, 3)]));
const compositions = new Map(df.recordsOfType('MineableComposition').map((record) => [idOf(record), df.readRecord(record, 4)]));
const entityByClass = new Map(df.recordsOfType('EntityClassDefinition').map((record) => [idOf(record).toLowerCase(), record]));

// 채집 목록 항목 → 암석 구성
const presetComposition = new Map();
for (const record of df.recordsOfType('HarvestablePreset')) {
    const entity = entityByClass.get(String(short(df.readRecord(record, 3).entityClass) || '').toLowerCase());
    if (!entity) continue;
    const composition = short(component(df.readRecord(entity, 5), 'MineableParams')?.composition);
    if (composition && compositions.has(composition)) presetComposition.set(idOf(record), composition);
}

// ---- 장소 --------------------------------------------------------------------
const starmap = new Map(df.recordsOfType('StarMapObject').map((record) => [idOf(record).toLowerCase(), record]));
// 천체가 아닌 지역은 게임에 표시 이름이 없다. 아래 이름은 내부 이름을 풀어 쓴 임의 표기다.
const AREA_NAMES = {
    AaronHalo: { en: 'Aaron Halo', ko: '아론 헤일로', system: 'Stanton' },
    Stanton2c_Belt: { en: 'Yela asteroid belt', ko: '옐라 소행성대', system: 'Stanton' },
    Lagrange_A: { en: 'Lagrange asteroid field (type A)', ko: '라그랑주 소행성대 (A형)', system: 'Stanton' },
    Lagrange_B: { en: 'Lagrange asteroid field (type B)', ko: '라그랑주 소행성대 (B형)', system: 'Stanton' },
    Lagrange_C: { en: 'Lagrange asteroid field (type C)', ko: '라그랑주 소행성대 (C형)', system: 'Stanton' },
    Lagrange_D: { en: 'Lagrange asteroid field (type D)', ko: '라그랑주 소행성대 (D형)', system: 'Stanton' },
    Lagrange_E: { en: 'Lagrange asteroid field (type E)', ko: '라그랑주 소행성대 (E형)', system: 'Stanton' },
    Lagrange_F: { en: 'Lagrange asteroid field (type F)', ko: '라그랑주 소행성대 (F형)', system: 'Stanton' },
    Lagrange_G: { en: 'Lagrange asteroid field (type G)', ko: '라그랑주 소행성대 (G형)', system: 'Stanton' },
    Lagrange_Occupied: { en: 'Lagrange point with a station', ko: '정거장이 있는 라그랑주 지점', system: 'Stanton' },
    Nyx_GlaciemRing: { en: 'Glaciem Ring', ko: '글라시엠 고리', system: 'Nyx' },
    Nyx_KeegerBelt: { en: 'Keeger Belt', ko: '키거 벨트', system: 'Nyx' },
    Pyro_AkiroCluster: { en: 'Akiro Cluster', ko: '아키로 성단', system: 'Pyro' },
    Pyro_DeepSpaceAsteroids: { en: 'Pyro deep-space asteroids', ko: '파이로 심우주 소행성', system: 'Pyro' },
    Pyro_Cool01: { en: 'Pyro asteroid field (cool 1)', ko: '파이로 소행성대 (저온 1)', system: 'Pyro' },
    Pyro_Cool02: { en: 'Pyro asteroid field (cool 2)', ko: '파이로 소행성대 (저온 2)', system: 'Pyro' },
    Pyro_Warm01: { en: 'Pyro asteroid field (warm 1)', ko: '파이로 소행성대 (고온 1)', system: 'Pyro' },
    Pyro_Warm02: { en: 'Pyro asteroid field (warm 2)', ko: '파이로 소행성대 (고온 2)', system: 'Pyro' },
};
// 행사용·시험용 목록은 싣지 않는다.
const SKIP_LOCATION = /ResourceRush|^AsteroidCluster_|ShipGraveyard|SpaceDerelict/;
const MODES = { SpaceShip_Mineables: 'ship', GroundVehicle_Mineables: 'vehicle', FPS_Mineables: 'hand' };

const usedMinerals = new Set();
const locations = [];
for (const record of df.recordsOfType('HarvestableProviderPreset')) {
    const key = idOf(record).replace(/^HPP_/, '');
    if (SKIP_LOCATION.test(key)) continue;
    const data = df.readRecord(record, 5);
    const groups = [];
    for (const group of data.harvestableGroups || []) {
        const mode = MODES[group.groupName]; if (!mode) continue;
        const rows = (group.harvestables || []).filter((row) => presetComposition.has(short(row.harvestable)));
        const total = rows.reduce((sum, row) => sum + (Number(row.relativeProbability) || 0), 0);
        const rocks = rows.map((row) => {
            const compositionId = presetComposition.get(short(row.harvestable)); const composition = compositions.get(compositionId);
            const minerals = (composition.compositionArray || []).map((part) => {
                const ore = short(elements.get(short(part.mineableElement))?.resourceType); if (!ore) return null;
                usedMinerals.add(ore);
                return prune({ id: ore, min: round(part.minPercentage), max: round(part.maxPercentage), chance: round(part.probability, 2) });
            }).filter(Boolean);
            return prune({ id: compositionId, name: names(composition.depositName), share: total ? round((Number(row.relativeProbability) || 0) / total * 100) : undefined, minerals });
        }).sort((x, y) => (y.share || 0) - (x.share || 0));
        if (rocks.length) groups.push({ mode, rocks });
    }
    if (!groups.length) continue;
    const body = starmap.get(key.toLowerCase());
    const bodyData = body ? df.readRecord(body, 2) : null;
    const area = AREA_NAMES[key];
    const name = (bodyData && names(bodyData.name)) || (area ? { en: area.en, ko: area.ko } : { en: key });
    const system = area?.system || (/^Stanton/.test(key) ? 'Stanton' : /^Pyro/.test(key) ? 'Pyro' : /^Nyx/.test(key) ? 'Nyx' : undefined);
    locations.push(prune({ id: key, name, system, kind: body ? 'body' : 'area', named: Boolean(bodyData && names(bodyData.name)) || undefined, parent: bodyData ? short(bodyData.parent) : undefined, groups }));
}
const SYSTEM_ORDER = ['Stanton', 'Pyro', 'Nyx'];
locations.sort((x, y) => SYSTEM_ORDER.indexOf(x.system) - SYSTEM_ORDER.indexOf(y.system) || (x.kind === y.kind ? x.id.localeCompare(y.id, 'en', { numeric: true }) : x.kind === 'body' ? -1 : 1));

// ---- 광물 --------------------------------------------------------------------
const elementByOre = new Map([...elements].map(([, element]) => [short(element.resourceType), element]));
const minerals = [...usedMinerals].map((ore) => {
    const resource = resourceTypes.get(ore); const element = elementByOre.get(ore);
    const refinedId = short(resource?.refinedVersion); const refined = refinedId ? resourceTypes.get(refinedId) : null;
    const modes = [...new Set(locations.flatMap((location) => location.groups.filter((group) => group.rocks.some((rock) => rock.minerals.some((m) => m.id === ore))).map((group) => group.mode)))];
    return prune({
        id: ore, name: names(resource?.displayName) || { en: ore },
        refined: refinedId ? prune({ id: refinedId, name: names(refined?.displayName) || { en: refinedId } }) : undefined,
        modes,
        instability: round(element?.elementInstability, 1), resistance: round(element?.elementResistance, 2),
        window: round(element?.elementOptimalWindowMidpoint, 2), windowThinness: round(element?.elementOptimalWindowThinness, 2), explosion: round(element?.elementExplosionMultiplier, 1),
    });
}).sort((x, y) => x.name.en.localeCompare(y.name.en));

const out = {
    version: `${build.Branch || ''}.${build.RequestedP4ChangeNum || ''}`.replace(/^sc-alpha-/, ''), gameVersion: build.Version, builtAt: new Date().toISOString(),
    source: 'game-files', koSource: ko ? 'korean-patch' : undefined,
    note: '비중과 함량은 게임 파일 값이며 게임 안 실측값이 아니다.',
    minerals, locations,
};
mkdirSync(resolve(ROOT, 'data/mining'), { recursive: true });
writeFileSync(resolve(ROOT, 'data/mining/mining.json'), `${JSON.stringify(out)}\n`);
const koNamed = minerals.filter((m) => m.name.ko).length;
console.log(`채광 자료: 광물 ${minerals.length}종(한글 이름 ${koNamed}), 장소 ${locations.length}곳(천체 ${locations.filter((l) => l.kind === 'body').length}), 크기 ${Math.round(JSON.stringify(out).length / 1024)}KB`);
