#!/usr/bin/env node
/**
 * 채광 안내용 자료 생성 — 설치된 게임 파일에서 직접 뽑는다.
 *
 * 입력(읽기 전용, --cache-dir 폴더): Game2.dcb, global.ini(영어), build.json
 *   선택: --ko-ini <한국어 패치 global.ini>  (없으면 한글 이름을 비워 둔다)
 *   선택: --p4k <Data.p4k>  장소 묶음(object container)을 훑어 "어느 장소가 어느 채집 목록을 쓰는지"를 찾고
 *         그 결과를 <cache-dir>/mining-links.json 에 적어 둔다. 이 인자가 없으면 그 파일을 읽는다.
 *         파일도 없으면 멈춘다(종료 코드 2). 저장된 자료에서 places·containers 가 말없이 빠지는 일을 막기 위해서다.
 *   선택: --no-links  장소 묶음 결과 없이 일부러 만든다. places·containers·usedBy·unplaced 를 빼고 unknowns.links 에 적는다.
 *   선택: --check  아무것도 쓰지 않고, 지금 만든 결과가 저장된 파일과 다르면 종료 코드 1 (builtAt 은 비교하지 않는다)
 * 출력: data/mining/helper.json
 *
 * 사용: node scripts/mining/build-mining-data.mjs --cache-dir <폴더> [--ko-ini <경로>] [--p4k <Data.p4k> | --no-links] [--check]
 * 외부 서비스에 접근하지 않는다. 시세·정제 수율은 화면이 UEX 프록시로 따로 조회한다(게임 파일에 정제 수율 숫자는 없다).
 *
 * 연결 고리: 장소별 채집 목록(HarvestableProviderPreset) → 암석(EntityClassDefinition.MineableParams.composition)
 *   → 암석 구성(MineableComposition) → 광물(MineableElement.resourceType) → 정제 상품(ResourceType.refinedVersion)
 * 비중·함량은 게임 파일의 값이다. 게임 안에서 실측한 출현율이 아니다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { DataForge } from '../gamedata/dataforge.mjs';
import { miningTraits } from '../gamedata/guide-extract.mjs';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_PATH = resolve(ROOT, 'data/mining/helper.json');
const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
const CHECK = process.argv.includes('--check');
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
const round = (value, digits = 1) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : undefined);
// 게임 파일의 32비트 실수(0.30000001…)를 사람이 적은 값(0.3)으로 되돌린다. 값 자체는 바꾸지 않는다.
const num = (value) => (Number.isFinite(value) ? Number(value.toPrecision(6)) : undefined);
const prune = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
const component = (entity, type) => (entity.Components || []).find((c) => c && c.__type === type);
const byNumericId = (x, y) => x.id.localeCompare(y.id, 'en', { numeric: true });

// ---- 상품과 광물 -------------------------------------------------------------
const resourceTypes = new Map(df.recordsOfType('ResourceType').map((record) => [idOf(record), df.readRecord(record, 4)]));
const elements = new Map(df.recordsOfType('MineableElement').map((record) => [idOf(record), df.readRecord(record, 3)]));
const compositions = new Map(df.recordsOfType('MineableComposition').map((record) => [idOf(record), df.readRecord(record, 4)]));
const entityByClass = new Map(df.recordsOfType('EntityClassDefinition').map((record) => [idOf(record).toLowerCase(), record]));

// 스캐너(레이더) 신호 종류 가운데 'RS 시그니처'가 몇 번째 칸인지: SignatureTypeGlobalParams.displayName
const signatureStruct = df.structByName.get('SignatureTypeGlobalParams');
let RS_INDEX = -1;
for (let index = 0; signatureStruct && index < df.instanceCount[signatureStruct.index]; index += 1) {
    if (String(df.readInstance(signatureStruct.index, index, 1, new Set())?.displayName).toLowerCase() === '@hud_scanning_info_rs_signature') RS_INDEX = index;
}
if (RS_INDEX < 0) throw new Error('RS 시그니처 칸(SignatureTypeGlobalParams)을 찾지 못했습니다.');

// 개체(암석·식물·잔해) 하나에서 필요한 값만: 암석 구성, 기본 RS 시그니처, 표시 이름
const entityCache = new Map();
function entityInfo(classId) {
    const key = String(classId || '').toLowerCase();
    if (!entityCache.has(key)) {
        const record = entityByClass.get(key);
        if (!record) entityCache.set(key, null);
        else {
            const data = df.readRecord(record, 6);
            const composition = short(component(data, 'MineableParams')?.composition);
            // SSCSignatureSystemParams.radarProperties.baseSignatureParams.signatures[RS 칸]. 구성 요소가 없으면 값도 없다(0 으로 채우지 않는다).
            const signature = component(data, 'SSCSignatureSystemParams')?.radarProperties?.baseSignatureParams?.signatures?.[RS_INDEX];
            entityCache.set(key, {
                id: idOf(record),
                composition: composition && compositions.has(composition) ? composition : undefined,
                sig: Number.isFinite(signature) && signature > 0 ? num(signature) : undefined,
                // SAttachableComponentParams.AttachDef.Localization.Name
                name: names(component(data, 'SAttachableComponentParams')?.AttachDef?.Localization?.Name),
            });
        }
    }
    return entityCache.get(key);
}

// 채집 목록 항목(HarvestablePreset) → 개체, 그리고 식물이 내놓는 것(subConfigBase.subConfigManual.subHarvestables)
const presets = new Map(df.recordsOfType('HarvestablePreset').map((record) => [idOf(record), df.readRecord(record, 5)]));
const presetEntity = (presetId) => entityInfo(short(presets.get(presetId)?.entityClass));
// 목록 한 줄(HarvestableElement / SubHarvestableSlot)이 가리키는 개체: harvestable(HarvestablePreset) 아니면 harvestableEntityClass
const rowEntity = (row) => (short(row.harvestable) ? presetEntity(short(row.harvestable)) : entityInfo(short(row.harvestableEntityClass)));

// ---- 무리(클러스터) 규칙: HarvestableClusterPreset ---------------------------
const clusterRecords = new Map(df.recordsOfType('HarvestableClusterPreset').map((record) => [idOf(record), df.readRecord(record, 3)]));
const usedClusters = new Set();
const clusterOf = (row) => { const id = short(row.clustering); if (id && clusterRecords.has(id)) { usedClusters.add(id); return id; } return undefined; };

// ---- 암석 사전 ---------------------------------------------------------------
const usedMinerals = new Set();
const usedElements = new Map();
const rockIndex = new Map(); // 암석 구성 id → { sig 후보, tier, modes }
const TIER = /(Uncommon|Common|Rare|Epic|Legendary)/;
function mineralParts(compositionId, track) {
    return (compositions.get(compositionId).compositionArray || []).map((part) => {
        const ore = short(elements.get(short(part.mineableElement))?.resourceType); if (!ore) return null;
        if (track) {
            track.add(ore);
            if (!usedElements.has(ore)) usedElements.set(ore, new Set());
            usedElements.get(ore).add(short(part.mineableElement));
        }
        // MineableCompositionPart: minPercentage, maxPercentage, probability, qualityScale
        return prune({ id: ore, min: round(part.minPercentage), max: round(part.maxPercentage), chance: round(part.probability, 2), qualityScale: round(part.qualityScale, 3) });
    }).filter(Boolean);
}
function noteRock(entity, mode) {
    if (!rockIndex.has(entity.composition)) rockIndex.set(entity.composition, { sigs: new Set(), tiers: new Set(), modes: new Set() });
    const entry = rockIndex.get(entity.composition);
    if (entity.sig !== undefined) entry.sigs.add(entity.sig);
    const tier = TIER.exec(entity.id)?.[1]; if (tier) entry.tiers.add(tier.toLowerCase());
    if (mode) entry.modes.add(mode);
}

// ---- 장소 --------------------------------------------------------------------
const starmap = new Map(df.recordsOfType('StarMapObject').map((record) => [idOf(record).toLowerCase(), record]));
const starmapData = new Map();
const starObject = (id) => { const key = String(id || '').toLowerCase(); if (!starmapData.has(key)) starmapData.set(key, starmap.has(key) ? df.readRecord(starmap.get(key), 2) : null); return starmapData.get(key); };
const starTypes = new Map(df.recordsOfType('StarMapObjectType').map((record) => [idOf(record), df.readRecord(record, 1).name]));
const STAR_SYSTEM = { StantonStar: 'Stanton', PyroStar: 'Pyro', NyxStar: 'Nyx' };
// 별 지도에서 부모를 따라 올라가 항성을 찾는다: StarMapObject.parent
function systemOf(id) {
    let current = id;
    for (let hop = 0; current && hop < 12; hop += 1) { if (STAR_SYSTEM[current]) return STAR_SYSTEM[current]; current = short(starObject(current)?.parent); }
    return undefined;
}
// 천체가 아닌 지역. key 가 있는 줄은 게임 글자 파일(global.ini)에 이름이 있어 거기서 읽는다(영어·한국어 모두, named: true).
//   채집 목록과 그 글자 키를 잇는 고리는 게임 파일에 없어, 영어 이름이 같은 키를 우리가 골라 적은 것이다.
// key 가 없는 줄은 게임에 표시 이름이 없다. 이름은 내부 이름을 풀어 쓴 임의 표기이고(한국어도 패치 글이 아니다), type 은 우리가 붙인 분류다.
// unplaced: 장소 묶음을 모두 훑어도 소행성 무리 본보기 묶음(asteroidCluster/miningasteroid_00x)에서만 나오고
//   어느 라그랑주 지점·천체도 쓰지 않는 목록. 기록 이름은 Lagrange_ 로 시작하지만 라그랑주 지점 목록으로 보여 주면 안 된다.
const AREA_NAMES = {
    AaronHalo: { key: '@AaronHalo', system: 'Stanton', type: 'belt' },
    Stanton2c_Belt: { en: 'Yela asteroid belt', ko: '옐라 소행성대', system: 'Stanton', type: 'belt' },
    Lagrange_A: { en: 'Lagrange asteroid field (type A)', ko: '라그랑주 소행성대 (A형)', system: 'Stanton', type: 'lagrange' },
    Lagrange_B: { en: 'Lagrange asteroid field (type B)', ko: '라그랑주 소행성대 (B형)', system: 'Stanton', type: 'lagrange' },
    Lagrange_C: { en: 'Lagrange asteroid field (type C)', ko: '라그랑주 소행성대 (C형)', system: 'Stanton', type: 'lagrange' },
    Lagrange_D: { en: 'Lagrange asteroid field (type D)', ko: '라그랑주 소행성대 (D형)', system: 'Stanton', type: 'lagrange' },
    Lagrange_E: { en: 'Lagrange asteroid field (type E)', ko: '라그랑주 소행성대 (E형)', system: 'Stanton', type: 'lagrange' },
    Lagrange_F: { en: 'Lagrange asteroid field (type F)', ko: '라그랑주 소행성대 (F형)', system: 'Stanton', type: 'lagrange' },
    Lagrange_G: { en: 'Asteroid cluster table "Lagrange G" (not placed)', ko: '소행성 무리 목록 "Lagrange G" (쓰는 곳 없음)', system: 'Stanton', type: 'cluster', unplaced: true },
    Lagrange_Occupied: { en: 'Asteroid cluster table "Lagrange Occupied" (not placed)', ko: '소행성 무리 목록 "Lagrange Occupied" (쓰는 곳 없음)', system: 'Stanton', type: 'cluster', unplaced: true },
    Nyx_GlaciemRing: { key: '@Nyx_AsteroidBelt1', system: 'Nyx', type: 'belt' },
    Nyx_KeegerBelt: { key: '@Nyx_AsteroidBelt2', system: 'Nyx', type: 'belt' },
    Pyro_AkiroCluster: { en: 'Akiro Cluster', ko: '아키로 성단', system: 'Pyro', type: 'cluster' },
    Pyro_DeepSpaceAsteroids: { en: 'Pyro deep-space asteroids', ko: '파이로 심우주 소행성', system: 'Pyro', type: 'cluster' },
    Pyro_Cool01: { en: 'Pyro asteroid field (cool 1)', ko: '파이로 소행성대 (저온 1)', system: 'Pyro', type: 'lagrange' },
    Pyro_Cool02: { en: 'Pyro asteroid field (cool 2)', ko: '파이로 소행성대 (저온 2)', system: 'Pyro', type: 'lagrange' },
    Pyro_Warm01: { en: 'Pyro asteroid field (warm 1)', ko: '파이로 소행성대 (고온 1)', system: 'Pyro', type: 'lagrange' },
    Pyro_Warm02: { en: 'Pyro asteroid field (warm 2)', ko: '파이로 소행성대 (고온 2)', system: 'Pyro', type: 'lagrange' },
};
// 행사용·시험용 목록은 locations 에 싣지 않고 sites 에 따로 싣는다. 이름과 type 은 우리가 붙인 것이다.
const SKIP_LOCATION = /ResourceRush|^AsteroidCluster_|ShipGraveyard|SpaceDerelict/;
const SITE_NAMES = {
    ResourceRush_Gold: { en: 'Resource Rush gold field', ko: '리소스 러시 금 소행성대', type: 'event' },
    ResourceRush_Gold_HighDensity: { en: 'Resource Rush gold field (dense)', ko: '리소스 러시 금 소행성대 (밀집)', type: 'event' },
    AsteroidCluster_Low_Yield: { en: 'Asteroid cluster (low yield)', ko: '소행성 무리 (낮은 수확)', type: 'cluster' },
    AsteroidCluster_Medium_Yield: { en: 'Asteroid cluster (medium yield)', ko: '소행성 무리 (중간 수확)', type: 'cluster' },
    ShipGraveyard_001: { en: 'Ship graveyard', ko: '함선 무덤', type: 'cluster' },
    SpaceDerelict_General: { en: 'Space derelict field', ko: '우주 난파선 지대', type: 'cluster' },
};
const MODES = { SpaceShip_Mineables: 'ship', GroundVehicle_Mineables: 'vehicle', FPS_Mineables: 'hand' };
// 식물 묶음 이름은 파이로 쪽 기록에 오타(Havestables)로 들어 있다.
const HARVEST_GROUPS = new Set(['Harvestables', 'Havestables']);
const SALVAGE_GROUPS = { Salvage_FreshDerelicts: 'fresh', Salvage_BrokenShips_Poor: 'poor', Salvage_BrokenShips_Normal: 'normal', Salvage_BrokenShips_Elite: 'elite' };

const harvestables = new Map(); // HarvestablePreset id → { name, sig, gives }
function noteHarvestable(presetId) {
    if (harvestables.has(presetId)) return;
    const entity = presetEntity(presetId);
    const sub = presets.get(presetId)?.subConfigBase?.subConfigManual;
    // 식물이 내놓는 것: HarvestablePreset.subConfigBase.subConfigManual.subHarvestables[].harvestable → 그 개체의 표시 이름
    const gives = (sub?.subHarvestables || []).map((slot) => { const id = short(slot.harvestable); return id ? prune({ id, name: presetEntity(id)?.name }) : null; }).filter(Boolean);
    // kind: 기록 이름 머리말(Plant_ / Scrap_)로 가른 우리 분류. 식물 묶음에 고철(Scrap_CompBoard)이 섞여 있어 화면이 가려낼 수 있게 적는다.
    const kind = /^Plant_/.test(presetId) ? 'plant' : /^Scrap_/.test(presetId) ? 'scrap' : 'other';
    harvestables.set(presetId, prune({ name: entity?.name, kind, sig: entity?.sig, gives, slotChance: gives.length ? num(sub.initialSlotsProbability) : undefined }));
}
const wrecks = new Map(); // 잔해 개체 id → { name, sig, kind }
function noteWreck(entity) {
    if (wrecks.has(entity.id)) return;
    const kind = /^SalvageableDebris_/.test(entity.id) ? 'ship' : /ShipDebris_(S|M|XL)_/.test(entity.id) ? `debris-${/ShipDebris_(S|M|XL)_/.exec(entity.id)[1].toLowerCase()}` : 'scrap';
    wrecks.set(entity.id, prune({ name: entity.name, sig: entity.sig, kind }));
}
const shares = (rows) => (rows.length && rows.every((row) => Number.isFinite(row.relativeProbability) && row.relativeProbability >= 0) ? rows.reduce((sum, row) => sum + row.relativeProbability, 0) : undefined);
const salvageSets = new Map(); // 내용이 같은 잔해 목록은 한 번만 싣는다
const salvageSetKeys = new Map();
function salvageSet(kind, items) {
    const text = JSON.stringify(items);
    if (!salvageSetKeys.has(text)) { const key = `${kind}-${[...salvageSetKeys.values()].filter((k) => k.startsWith(`${kind}-`)).length + 1}`; salvageSetKeys.set(text, key); salvageSets.set(key, items); }
    return salvageSetKeys.get(text);
}

/** 채집 목록(HarvestableProviderPreset) 하나를 장소 자료로 바꾼다. track 이 있으면 광물 목록에 반영한다. */
function readProvider(data, track) {
    const groups = [];
    let harvest;
    const salvage = [];
    const elementIds = new Map(); // 지형별 보정에서 같은 줄을 찾기 위한 표
    for (const group of data.harvestableGroups || []) {
        const mode = MODES[group.groupName];
        // HarvestableElementGroup.groupProbability: 이 묶음 자체의 가중치(묶음끼리 견주는 값)
        const weight = num(group.groupProbability);
        if (mode) {
            const rows = (group.harvestables || []).filter((row) => rowEntity(row)?.composition);
            const total = shares(rows);
            const rocks = rows.map((row) => {
                const entity = rowEntity(row); const composition = compositions.get(entity.composition);
                noteRock(entity, mode);
                return prune({ id: entity.composition, name: names(composition.depositName), share: total > 0 ? round(row.relativeProbability / total * 100) : undefined, cluster: clusterOf(row), minerals: mineralParts(entity.composition, track) });
            }).sort((x, y) => (y.share || 0) - (x.share || 0));
            // 게임 파일에서 개체 참조가 비어 있는 줄(HarvestablePreset.entityClass 가 빈 값)은 암석을 알 수 없다. 이름만 남긴다.
            const unresolved = (group.harvestables || []).filter((row) => short(row.harvestable) && !rowEntity(row)?.composition).map((row) => short(row.harvestable));
            if (rocks.length || unresolved.length) groups.push({ ...prune({ mode, weight, unresolved }), rocks });
        } else if (HARVEST_GROUPS.has(group.groupName)) {
            const rows = (group.harvestables || []).filter((row) => short(row.harvestable) && presetEntity(short(row.harvestable)));
            const total = shares(rows);
            const items = rows.map((row) => { const id = short(row.harvestable); noteHarvestable(id); return prune({ id, share: total > 0 ? round(row.relativeProbability / total * 100) : undefined, cluster: clusterOf(row) }); })
                .sort((x, y) => (y.share || 0) - (x.share || 0));
            if (items.length) harvest = prune({ weight, items });
        } else if (SALVAGE_GROUPS[group.groupName]) {
            const rows = (group.harvestables || []).filter((row) => rowEntity(row));
            const total = shares(rows);
            const items = rows.map((row) => { const entity = rowEntity(row); noteWreck(entity); return prune({ id: entity.id, share: total > 0 ? round(row.relativeProbability / total * 100, 2) : undefined, cluster: clusterOf(row) }); })
                .sort((x, y) => (y.share || 0) - (x.share || 0));
            if (items.length) salvage.push(prune({ kind: SALVAGE_GROUPS[group.groupName], weight, set: salvageSet(SALVAGE_GROUPS[group.groupName], items) }));
        }
    }
    // 지형(생물군계)별 보정: HarvestableAreaPreset.globalModifier, modifiers[].harvestableModifier. 뜻(배수인지 여부)은 확인하지 못했다.
    const areas = (data.areas || []).map((area) => {
        const mods = {};
        for (const modifier of area.modifiers || []) {
            const element = modifier.harvestableElement; const entity = element && rowEntity(element); if (!entity) continue;
            const id = entity.composition || short(element.harvestable); if (!id || !Number.isFinite(modifier.harvestableModifier)) continue;
            elementIds.set(id, true); mods[id] = num(modifier.harvestableModifier);
        }
        return prune({ name: area.debugGroupName, global: num(area.globalModifier), mods: Object.keys(mods).length ? mods : undefined });
    }).filter((area) => area.name);
    return { groups, harvest, salvage, areas };
}

const locations = [];
const providerSites = [];
const providerGuid = new Map(); // 채집 목록 기록 id(GUID) → 장소 id
for (const record of df.recordsOfType('HarvestableProviderPreset')) {
    const key = idOf(record).replace(/^HPP_/, '');
    providerGuid.set(record.id.toLowerCase(), key);
    const isSite = SKIP_LOCATION.test(key);
    const { groups, harvest, salvage, areas } = readProvider(df.readRecord(record, 6), isSite ? null : usedMinerals);
    // 기록 파일 경로(harvestable/providerpresets/system/<성계>/…)의 성계
    const fileSystem = /providerpresets\/system\/([a-z]+)\//.exec(record.file || '')?.[1];
    const pathSystem = fileSystem ? fileSystem[0].toUpperCase() + fileSystem.slice(1) : undefined;
    if (isSite) {
        if (!groups.length && !salvage.length) continue;
        const site = SITE_NAMES[key];
        providerSites.push(prune({ id: key, name: site ? { en: site.en, ko: site.ko } : { en: key }, type: site?.type || 'cluster', system: pathSystem, groups, salvage }));
        continue;
    }
    if (!groups.some((group) => group.rocks.length)) continue;
    const body = starmap.get(key.toLowerCase());
    const bodyData = body ? starObject(key) : null;
    const area = AREA_NAMES[key];
    // 이름: 천체는 StarMapObject.name, 지역은 위 표의 글자 키(global.ini) — 둘 다 게임 글자다. 없으면 임의 표기.
    const gameName = (bodyData && names(bodyData.name)) || (area?.key ? names(area.key) : undefined);
    if (area?.key && !gameName) throw new Error(`${key}: 글자 키 ${area.key} 를 global.ini 에서 찾지 못했습니다.`);
    const name = gameName || (area ? { en: area.en, ko: area.ko } : { en: key });
    const system = area?.system || (/^Stanton/.test(key) ? 'Stanton' : /^Pyro/.test(key) ? 'Pyro' : /^Nyx/.test(key) ? 'Nyx' : undefined);
    if (pathSystem && system && pathSystem !== system) throw new Error(`${key}: 성계가 기록 경로(${pathSystem})와 다릅니다(${system}).`);
    // 장소 종류: 천체는 StarMapObject.type(StarMapObjectType.name), 그 밖은 위 표의 분류
    const starType = bodyData ? starTypes.get(short(bodyData.type)) : undefined;
    const type = starType === 'Planet' ? 'planet' : starType === 'Moon' ? 'moon' : area?.type;
    locations.push(prune({ id: key, name, system, type, kind: body ? 'body' : 'area', named: gameName ? true : undefined, parent: bodyData ? short(bodyData.parent) : undefined, groups: groups.filter((group) => group.rocks.length), harvest, salvage, areas }));
}
const SYSTEM_ORDER = ['Stanton', 'Pyro', 'Nyx'];
locations.sort((x, y) => SYSTEM_ORDER.indexOf(x.system) - SYSTEM_ORDER.indexOf(y.system) || (x.kind === y.kind ? x.id.localeCompare(y.id, 'en', { numeric: true }) : x.kind === 'body' ? -1 : 1));
providerSites.sort(byNumericId);

// ---- 고정 자리 채집 목록(동굴·행사·시설): SubHarvestableConfigRecord / SubHarvestableMultiConfigRecord ----
const slotRecords = new Map(df.recordsOfType('SubHarvestableConfigRecord').map((record) => [idOf(record), record]));
function slotGroup(name, config) {
    if (!config || config.__type !== 'SubHarvestableConfig') return null;
    const items = [];
    for (const slot of config.subHarvestables || []) {
        const entity = rowEntity(slot); const presetId = short(slot.harvestable);
        // SubHarvestableSlot.relativeProbability, relativeProbabilityDeepest.probability(가장 깊은 자리에서 대신 쓰는 값)
        const weights = { w: num(slot.relativeProbability), wDeep: num(slot.relativeProbabilityDeepest?.probability) };
        if (entity?.composition) { noteRock(entity, undefined); items.push(prune({ rock: entity.composition, ...weights })); }
        else if (presetId && /^Plant_/.test(presetId) && entity) { noteHarvestable(presetId); items.push(prune({ plant: presetId, ...weights })); }
    }
    // SubHarvestableConfig.initialSlotsProbability(자리마다 무언가 놓일 확률), initialSlotsProbabilityDeepest.probability
    return items.length ? prune({ name, chance: num(config.initialSlotsProbability), chanceDeep: num(config.initialSlotsProbabilityDeepest?.probability), items }) : null;
}
function singleConfig(holder) { // SubHarvestableConfigSingleRef.subConfigRef | SubHarvestableConfigSingleManual.subConfigManual
    if (!holder) return null;
    if (holder.__type === 'SubHarvestableConfig') return holder;
    if (holder.subConfigManual) return holder.subConfigManual;
    const ref = short(holder.subConfigRef);
    return ref && slotRecords.has(ref) ? df.readRecord(slotRecords.get(ref), 4).subConfig : null;
}
const slotSites = [];
const slotSiteType = (id, file) => (/orbageddon|apexgeddon|resourcerush|battaglia/i.test(`${id} ${file}`) || /^(ORB|APX)_/i.test(id) ? 'event' : /cave/i.test(`${id} ${file}`) ? 'cave' : 'site');
const slotSystem = (id) => (/_Stanton(_|$)|Hurston|Aberdeen|Daymar/.test(id) ? 'Stanton' : /_Pyro(_|$)/.test(id) ? 'Pyro' : undefined);
for (const record of df.recordsOfType('SubHarvestableMultiConfigRecord')) {
    const multi = df.readRecord(record, 7).multiConfig; if (!multi) continue;
    const slots = [slotGroup('', singleConfig(multi.defaultConfig)), ...(multi.taggedConfigs || []).map((tagged) => slotGroup(tagged.name || '', singleConfig(tagged.subConfig)))].filter(Boolean);
    if (slots.some((slot) => slot.items.some((item) => item.rock))) slotSites.push(prune({ id: idOf(record), type: slotSiteType(idOf(record), record.file), system: slotSystem(idOf(record)), slots }));
}
const referencedSingles = new Set();
for (const record of df.recordsOfType('SubHarvestableMultiConfigRecord')) {
    for (const tagged of [df.readRecord(record, 3).multiConfig?.defaultConfig, ...(df.readRecord(record, 3).multiConfig?.taggedConfigs || []).map((t) => t.subConfig)]) { const ref = short(tagged?.subConfigRef); if (ref) referencedSingles.add(ref); }
}
for (const [id, record] of slotRecords) {
    const slot = slotGroup('', df.readRecord(record, 5).subConfig);
    // 여러 묶음 기록이 가져다 쓰는 낱개 기록은 그쪽에 이미 실렸으므로 다시 싣지 않는다.
    if (slot?.items.some((item) => item.rock) && !referencedSingles.has(id)) slotSites.push(prune({ id, type: slotSiteType(id, record.file), system: slotSystem(id), slots: [slot] }));
}
// 시험용 기록은 뺀다. 내용(종류·성계·자리 목록)이 똑같은 기록은 한 줄로 묶고 나머지 이름을 also 에 적는다.
const mergedSlotSites = new Map();
for (const site of slotSites.filter((entry) => !/_Test$/i.test(entry.id)).sort(byNumericId)) {
    const key = JSON.stringify([site.type, site.system, site.slots]);
    if (mergedSlotSites.has(key)) { const first = mergedSlotSites.get(key); first.also = [...(first.also || []), site.id]; }
    else mergedSlotSites.set(key, site);
}
const sites = [...providerSites, ...mergedSlotSites.values()];

// ---- 암석 사전(스캐너 값 → 암석 찾기용) -----------------------------------
const locationRockIds = new Set(locations.flatMap((location) => location.groups.flatMap((group) => group.rocks.map((rock) => rock.id))));
const MODE_BY_NAME = [[/FPS/i, 'hand'], [/GroundVehicle/i, 'vehicle'], [/ShipMineable|Asteroid/i, 'ship']];
const rocks = {};
for (const [id, entry] of [...rockIndex].sort(([x], [y]) => x.localeCompare(y, 'en', { numeric: true }))) {
    if (entry.sigs.size > 1) throw new Error(`${id}: 같은 암석 구성에 RS 시그니처가 여러 값입니다(${[...entry.sigs]}).`);
    const composition = compositions.get(id);
    // 채광 방식: 장소 목록의 묶음 이름에서. 고정 자리에만 나오는 암석은 구성 기록 이름에서 가려낸다.
    const modes = entry.modes.size ? [...entry.modes] : MODE_BY_NAME.filter(([pattern]) => pattern.test(id)).map(([, mode]) => mode).slice(0, 1);
    rocks[id] = prune({
        name: names(composition.depositName), sig: [...entry.sigs][0],
        tier: entry.tiers.size === 1 ? [...entry.tiers][0] : undefined, // 개체 기록 이름(MineableRock_…Common/Uncommon/Rare/Epic/Legendary…)에 든 등급
        modes, minerals: locationRockIds.has(id) ? undefined : mineralParts(id, null),
    });
}
const clusters = Object.fromEntries([...usedClusters].sort().map((id) => {
    const data = clusterRecords.get(id);
    // HarvestableClusterPreset.probabilityOfClustering, clusterParamsArray[].{relativeProbability,minSize,maxSize}
    return [id, prune({ chance: num(data.probabilityOfClustering), sizes: (data.clusterParamsArray || []).map((params) => prune({ w: num(params.relativeProbability), min: params.minSize, max: params.maxSize })) })];
}));

// ---- 품질 범위 ---------------------------------------------------------------
const distribution = (value) => (value && Number.isFinite(value.min) && Number.isFinite(value.max) ? prune({ min: num(value.min), max: num(value.max), mean: num(value.mean), stddev: num(value.stddev) }) : undefined);
const qualityDists = new Map(df.recordsOfType('CraftingQualityDistributionRecord').map((record) => [idOf(record), distribution(df.readRecord(record, 3).qualityDistribution)]));
const qualityOverrideRecords = new Map(df.recordsOfType('CraftingQualityLocationOverrideRecord').map((record) => [idOf(record), df.readRecord(record, 5)]));
function qualityOverride(id) {
    // CraftingQualityLocationOverrideRecord.locationOverride.locationOverrideList[].{location → StarMapObject, qualityDistribution}
    const grouped = new Map();
    for (const entry of qualityOverrideRecords.get(id)?.locationOverride?.locationOverrideList || []) {
        const place = short(entry.location); const dist = distribution(entry.qualityDistribution); if (!place || !dist) continue;
        const system = systemOf(place); const isSystem = /SolarSystem$/.test(place);
        const name = isSystem ? undefined : names(starObject(place)?.name);
        // 값과 표시 이름이 같은 장소(예: QV 브레이커 스테이션 61곳)는 한 줄로 묶고 개수만 적는다.
        const key = JSON.stringify([isSystem ? place : name?.en || place, dist]);
        if (!grouped.has(key)) grouped.set(key, prune({ system: isSystem ? place.replace(/SolarSystem$/, '') : system, place: isSystem ? undefined : place, name, count: 0, ...dist }));
        grouped.get(key).count += 1;
    }
    return [...grouped.values()].map((row) => (row.count > 1 ? row : prune({ ...row, count: undefined })));
}
const usedDists = new Set(); const usedOverrides = new Set();
function mineralQuality(resource) {
    // ResourceType.properties[](ResourceTypeCraftingData).qualityDistribution.qualityDistributionRecord / qualityLocationOverride.locationOverrideRecord
    const data = (resource?.properties || []).find((property) => property?.__type === 'ResourceTypeCraftingData');
    const dist = short(data?.qualityDistribution?.qualityDistributionRecord); const over = short(data?.qualityLocationOverride?.locationOverrideRecord);
    if (!dist || !qualityDists.get(dist)) return undefined;
    usedDists.add(dist); if (over && qualityOverrideRecords.has(over)) usedOverrides.add(over);
    return prune({ dist, over: over && qualityOverrideRecords.has(over) ? over : undefined });
}

// ---- 광물 --------------------------------------------------------------------
function mineralRow(ore, elementIds, modes) {
    const resource = resourceTypes.get(ore);
    const refinedId = short(resource?.refinedVersion); const refined = refinedId ? resourceTypes.get(refinedId) : null;
    return prune({
        id: ore, name: names(resource?.displayName) || { en: ore },
        refined: refinedId ? prune({ id: refinedId, name: names(refined?.displayName) || { en: refinedId } }) : undefined,
        modes,
        elementSources: elementIds,
        ...miningTraits(elementIds.map((id) => elements.get(id))),
        quality: mineralQuality(resource),
    });
}
const minerals = [...usedMinerals].map((ore) => {
    const modes = [...new Set(locations.flatMap((location) => location.groups.filter((group) => group.rocks.some((rock) => rock.minerals.some((m) => m.id === ore))).map((group) => group.mode)))];
    return mineralRow(ore, [...usedElements.get(ore)], modes);
}).sort((x, y) => x.name.en.localeCompare(y.name.en));
// 고정 자리·행사 목록에만 나오는 광물. minerals 에 넣지 않는다(기존 화면과 제작 자료가 minerals 를 "일반 장소에서 캐는 광물"로 쓴다).
const extraElements = new Map();
for (const [id] of rockIndex) {
    for (const part of compositions.get(id).compositionArray || []) {
        const ore = short(elements.get(short(part.mineableElement))?.resourceType); if (!ore || usedMinerals.has(ore)) continue;
        if (!extraElements.has(ore)) extraElements.set(ore, new Set());
        extraElements.get(ore).add(short(part.mineableElement));
    }
}
const extraMinerals = [...extraElements].map(([ore, ids]) => {
    const modes = [...new Set(Object.entries(rocks).filter(([id]) => (compositions.get(id).compositionArray || []).some((part) => short(elements.get(short(part.mineableElement))?.resourceType) === ore)).flatMap(([, rock]) => rock.modes || []))];
    return mineralRow(ore, [...ids], modes);
}).sort((x, y) => x.name.en.localeCompare(y.name.en));

const qualityByMode = {};
for (const mineral of [...minerals, ...extraMinerals]) {
    for (const mode of mineral.modes || []) {
        if (!mineral.quality) continue;
        qualityByMode[mode] ||= { dists: new Set(), overs: new Set() };
        qualityByMode[mode].dists.add(mineral.quality.dist); if (mineral.quality.over) qualityByMode[mode].overs.add(mineral.quality.over);
    }
}
const quality = {
    dists: Object.fromEntries([...usedDists].sort().map((id) => [id, qualityDists.get(id)])),
    overrides: Object.fromEntries([...usedOverrides].sort().map((id) => [id, qualityOverride(id)])),
    byMode: Object.fromEntries(['ship', 'vehicle', 'hand'].filter((mode) => qualityByMode[mode]).map((mode) => [mode, prune({ dists: [...qualityByMode[mode].dists].sort(), overrides: [...qualityByMode[mode].overs].sort() })])),
};

// ---- 드물거나 특별한 매장지 ---------------------------------------------------
const special = Object.entries(rocks).map(([id, rock]) => {
    const at = locations.filter((location) => location.groups.some((group) => group.rocks.some((row) => row.id === id))).map((location) => location.id);
    const inSites = sites.filter((site) => (site.groups || []).some((group) => group.rocks.some((row) => row.id === id)) || (site.slots || []).some((slot) => slot.items.some((item) => item.rock === id))).map((site) => site.id);
    // 싣는 기준: 등급이 epic/legendary 이거나, 일반 장소 목록에는 없고 고정 자리·행사 목록에만 있는 암석
    return (rock.tier === 'epic' || rock.tier === 'legendary' || !at.length) ? prune({ rock: id, tier: rock.tier, siteOnly: at.length ? undefined : true, at, sites: inSites }) : null;
}).filter(Boolean);

// ---- 정제소가 있는 곳: StarMapObject.amenities[] → StarMapAmenityTypeEntry(name 'Refinery') ----
const refineryAmenity = df.recordsOfType('StarMapAmenityTypeEntry').find((record) => df.readRecord(record, 1).name === 'Refinery');
const refineries = !refineryAmenity ? [] : df.recordsOfType('StarMapObject').map((record) => {
    const data = starObject(idOf(record));
    if (!(data.amenities || []).some((amenity) => short(amenity) === idOf(refineryAmenity))) return null;
    return prune({ id: idOf(record), name: names(data.name), system: systemOf(idOf(record)), parent: short(data.parent) });
}).filter(Boolean).sort(byNumericId);

// ---- 장소 묶음(object container)에서 찾은 연결 --------------------------------
const LINKS_PATH = resolve(CACHE, 'mining-links.json');
const LINK_SCOPE = 'all-socpak-all-files'; // 훑는 범위가 바뀌면 이 값을 바꿔 예전 결과 파일을 못 쓰게 한다.
function unzipEntries(buffer) { // socpak 은 보통의 ZIP 이다. 안에 든 파일을 모두 꺼낸다(행성 묶음은 .pla 파일에 채집 목록 GUID 가 적혀 있다).
    const out = []; const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); if (end < 0) return out;
    const count = buffer.readUInt16LE(end + 10); let p = buffer.readUInt32LE(end + 16);
    for (let index = 0; index < count && buffer.readUInt32LE(p) === 0x02014b50; index += 1) {
        const method = buffer.readUInt16LE(p + 10); const size = buffer.readUInt32LE(p + 20); const nameLength = buffer.readUInt16LE(p + 28);
        const local = buffer.readUInt32LE(p + 42); const name = buffer.toString('utf8', p + 46, p + 46 + nameLength);
        p += 46 + nameLength + buffer.readUInt16LE(p + 30) + buffer.readUInt16LE(p + 32);
        const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
        let data = buffer.subarray(start, start + size);
        try { if (method === 8) data = zlib.inflateRawSync(data); else if (method !== 0) data = zlib.zstdDecompressSync(data); } catch { continue; }
        out.push({ name, data });
    }
    return out;
}
async function scanLinks(p4kPath) {
    const { P4k } = await import('../gamedata/p4k.mjs');
    const p4k = new P4k(p4kPath);
    const tables = {}; const lagrange = {};
    try {
        // 장소 묶음(.socpak)을 전부 본다(9천여 개). 성계 폴더 밖(착륙 구역·정거장·기지 묶음)에서도 채집 목록을 쓰기 때문이다.
        const entries = p4k.find((name) => /\.socpak$/i.test(name));
        const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
        for (const entry of entries) {
            const base = entry.name.split(/[\\/]/).pop().replace(/\.socpak$/i, '').toLowerCase();
            const isLagrangePoint = /lagrangepoints.[a-z]+\d_l\d\.socpak$/i.test(entry.name);
            let files; try { files = unzipEntries(p4k.extract(entry)); } catch { continue; }
            for (const file of files) {
                const text = file.data.toString('latin1');
                // 채집 목록 기록의 GUID 가 글자로 적혀 있으면 그 장소가 그 목록을 쓴다.
                for (const match of text.matchAll(GUID)) { const key = providerGuid.get(match[0].toLowerCase()); if (key) { tables[key] ||= []; if (!tables[key].includes(base)) tables[key].push(base); } }
                // 라그랑주 지점 묶음은 소행성 구름 묶음(childcloud_*)을 이름으로 불러 쓴다.
                if (isLagrangePoint) for (const match of text.toLowerCase().matchAll(/childcloud_[a-z0-9_]+/g)) { lagrange[base] ||= []; if (!lagrange[base].includes(match[0])) lagrange[base].push(match[0]); }
            }
        }
    } finally { p4k.close(); }
    for (const list of [...Object.values(tables), ...Object.values(lagrange)]) list.sort();
    const sorted = (object) => Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]));
    return { gameVersion: build.Version, scope: LINK_SCOPE, tables: sorted(tables), lagrange: sorted(lagrange) };
}
let links = null;
if (arg('--p4k')) {
    links = await scanLinks(arg('--p4k'));
    if (!CHECK) writeFileSync(LINKS_PATH, `${JSON.stringify(links)}\n`);
} else if (existsSync(LINKS_PATH)) {
    links = JSON.parse(readFileSync(LINKS_PATH, 'utf8'));
    if (links.gameVersion !== build.Version) { console.error(`mining-links.json 은 다른 빌드(${links.gameVersion})의 것입니다. --p4k 로 다시 만드세요.`); process.exit(2); }
    if (links.scope !== LINK_SCOPE) { console.error('mining-links.json 이 예전 방식(일부 폴더만 훑음)으로 만든 것입니다. --p4k 로 다시 만드세요.'); process.exit(2); }
} else if (!process.argv.includes('--no-links')) {
    console.error(`${LINKS_PATH} 가 없습니다. --p4k <Data.p4k> 로 장소 묶음을 훑거나, 일부러 빼려면 --no-links 를 주세요.`);
    process.exit(2);
}
const places = [];
if (links) {
    const containerTables = new Map(); // 묶음 이름 → 그 안에서 찾은 채집 목록들
    for (const [key, bases] of Object.entries(links.tables)) for (const base of bases) { if (!containerTables.has(base)) containerTables.set(base, []); containerTables.get(base).push(key); }
    for (const location of locations) {
        const containers = links.tables[location.id];
        if (containers?.length) location.containers = containers;
        if (location.kind === 'body' && location.type !== 'cluster' && !containers?.includes(location.id.toLowerCase())) throw new Error(`${location.id}: 자기 장소 묶음에서 채집 목록을 찾지 못했습니다.`);
    }
    for (const site of providerSites) if (links.tables[site.id]?.length) site.containers = links.tables[site.id];
    const tableIds = new Set([...locations, ...providerSites].map((entry) => entry.id));
    // 라그랑주 지점 → 불러 쓰는 구름 묶음 → 그 안의 채집 목록. 지점 이름은 StarMapObject(id 가 묶음 이름과 같다).
    for (const [base, children] of Object.entries(links.lagrange)) {
        const record = starmap.get(base); if (!record) continue;
        const tables = [...new Set(children.flatMap((child) => containerTables.get(child) || []))].filter((key) => tableIds.has(key)).sort();
        places.push(prune({ id: idOf(record), name: names(starObject(base).name), system: systemOf(idOf(record)), type: 'lagrange', tables }));
    }
    // 천체 묶음이 자기 목록 말고 다른 지역 목록도 쓰는 경우(천체를 두른 소행성대)
    for (const location of locations.filter((entry) => entry.kind === 'body')) {
        const others = (containerTables.get(location.id.toLowerCase()) || []).filter((key) => key !== location.id && tableIds.has(key)).sort();
        if (others.length) places.push(prune({ id: location.id, name: location.name, system: location.system, type: 'belt', tables: others }));
    }
    places.sort(byNumericId);
    // usedBy: 이 목록을 쓰는 places[] 의 id(위 연결을 뒤집은 것). 한 목록을 다른 성계 장소가 쓰기도 한다(Stanton2c_Belt ← Pyro6).
    for (const location of locations) {
        const usedBy = places.filter((place) => place.tables.includes(location.id)).map((place) => place.id);
        if (usedBy.length) location.usedBy = usedBy;
        // 표의 분류가 훑은 결과와 어긋나면 멈춘다: 라그랑주 목록은 쓰는 지점이 있어야 하고, unplaced 목록은 쓰는 곳이 없어야 한다.
        if (location.type === 'lagrange' && !usedBy.length) throw new Error(`${location.id}: 라그랑주 목록인데 쓰는 지점이 없습니다. AREA_NAMES 를 고치세요.`);
        if (AREA_NAMES[location.id]?.unplaced) {
            if (usedBy.length || (location.containers || []).some((base) => !/^miningasteroid_\d+$/.test(base))) throw new Error(`${location.id}: unplaced 로 적혀 있지만 쓰는 곳이 있습니다(${usedBy}; ${location.containers}).`);
            location.unplaced = true;
        }
    }
    // 장소 묶음 어디에도 GUID 가 안 나오는 행사·시험용 목록
    for (const site of providerSites) if (!site.containers) site.unplaced = true;
}

const unknowns = prune({
    scanner: '스캐너 숫자가 "기본 RS 시그니처 × 무리의 암석 수"로 나온다는 규칙은 게임 파일에 적혀 있지 않다. 게임 안에서 확인해야 한다.',
    clusterChance: 'clusters[].chance(probabilityOfClustering)는 채광 쪽이 5~100, 잔해 쪽이 0.1~0.8 로 눈금이 섞여 있다. 단위를 확인하지 못했다.',
    quality: '품질을 min·max·mean·stddev 에서 어떻게 뽑는지(평균이 최솟값보다 낮은 경우 포함), 암석 부분의 qualityScale 이 그 품질에 어떻게 곱해지는지는 파일에 없다. 계산한 범위를 화면에 내지 말 것.',
    sameOreParts: '한 암석에 같은 광물이 두 줄(qualityScale 1 인 작은 부분과 0.49 인 큰 부분) 있을 때 스캔 화면에 한 줄로 합쳐 보이는지 두 줄인지 확인하지 못했다.',
    areas: 'areas[].global 과 mods 값(0·1·2·4)이 배수인지 켜고 끄는 값인지 확인하지 못했다.',
    live: '행사·시험용 목록(sites)이 지금 라이브 서버에서 켜져 있는지는 게임 파일로 알 수 없다.',
    caves: '동굴·시설의 고정 자리 목록(sites 의 slots)이 실제 어느 동굴에 쓰이는지는 풀지 못했다. 이름에 든 천체·성계만 적었다.',
    refineries: '정제소 표시는 별 지도 편의시설 꼬리표일 뿐, 정제 창구가 실제로 열려 있다는 보장이 아니다. UEX 정제 터미널 목록과는 다를 수 있다(2026-11-19 에 한 번 견줘 보니 PYAM-FARSTAT 계열과 이름 없는 파이로 정거장은 UEX 에 없었고, 레브스키는 UEX 에만 있었다). 화면은 UEX 에도 있는 곳만 "정제 가능"으로 다루는 편이 안전하다.',
    unresolved: 'groups[].unresolved 에 적힌 항목(행사용 금 소행성 Mining_AsteroidGoldOnly)은 게임 파일에서 개체 참조가 빈 값이라 어떤 암석인지 알 수 없다.',
    wreckYield: '난파선·잔해 하나에서 나오는 자재 양은 게임 파일에 숫자로 없다(선체 넓이·부피로 실행 중에 계산된다).',
    names: 'named: true 가 없는 locations[].name 과 sites[].name(영어·한국어 모두), 그리고 지역 목록의 type·system 과 sites[].type 은 게임 글자가 아니라 내부 이름을 보고 우리가 붙인 것이다. 한국어도 한국어 패치의 글이 아니다. 아론 헤일로·글레시엠 고리·키거 소행성대 이름은 글자 파일에서 읽지만, 목록과 글자 키를 이은 것은 우리다. 고정 자리 목록(slots 가 있는 sites)은 이름이 없어 id 만 있다.',
    sharedTables: '지역 목록 이름은 그 목록이 쓰이는 곳 전부를 뜻하지 않는다. Stanton2c_Belt("옐라 소행성대", system Stanton)는 파이로의 터미너스(Pyro6) 묶음에서도 쓰인다. 화면은 목록 이름이 아니라 places[] 항목(또는 locations[].usedBy)으로 장소를 적을 것.',
    unplaced: links ? 'unplaced: true 인 목록은 장소 묶음 전체를 훑어도 실제 장소에서 쓰는 곳을 찾지 못했다. locations 의 Lagrange_G·Lagrange_Occupied 는 소행성 무리 본보기 묶음(miningasteroid_00x)에만 있고, sites 의 것은 어느 묶음에도 없다. 실행 중에 미션이 불러 쓰는지는 알 수 없다. "갈 수 있는 장소"로 보여 주지 말 것.' : undefined,
    containers: links ? 'containers 는 "그 목록의 GUID 가 글자로 적힌 장소 묶음(.socpak) 파일 이름"이다. Data.p4k 의 장소 묶음을 모두 훑었지만, GUID 를 글자가 아닌 형태로 담은 파일이나 실행 중에 붙는 연결은 잡지 못한다. 폴더를 뺀 파일 이름이라 다른 성계의 자리 표시 묶음도 섞일 수 있다. 근거 자료로만 쓰고 "이 목록을 쓰는 장소 전부"로 읽지 말 것.' : undefined,
    lagrangeStation: 'places[] 의 라그랑주 지점과 그 지점의 정거장을 잇는 값은 따로 싣지 않았다(refineries[].parent 가 지점 id 와 같을 때만 이어 볼 수 있다). 지점에서 소행성대까지의 거리도 없다.',
    sigShared: 'rocks[].sig 만으로는 암석을 가려낼 수 없는 경우가 많다. 손 채광 암석은 모두 3000, 차량 채광 암석은 모두 4000 이고, 지표·소행성 변종은 같은 값을 쓴다. 무리 크기를 곱한 값도 서로 겹친다(예: 48000 = 4000×12 = 3000×16). 값으로 암석을 찾는 도구는 후보를 모두 보여 줘야 하며, 함선 채광 암석(광물마다 값이 다름)만 쓸 만하게 가려진다.',
    slots: 'sites 의 slots 에는 암석과 식물(Plant_)만 실었다. 같은 기록에 든 전리품 상자·그 밖의 채집물 줄은 뺐고, 암석이 하나도 없는 고정 자리 기록(식물만 있는 것 포함)은 싣지 않았다. 그래서 sites 는 동굴 식물 전체 목록이 아니다. also 는 "실린 암석·식물 줄이 똑같은 기록"이라는 뜻이지 기록 전체가 같다는 뜻이 아니다(전리품은 서로 다를 수 있다).',
    plants: 'harvestables 는 게임 파일 그대로다. Plant_Wuotan 은 내놓는 것(gives)이 자기 자신으로 적혀 있고, Scrap_CompBoard(kind scrap)는 식물이 아닌데 허스턴 식물 묶음에 들어 있으며 스캔 신호 값이 없다.',
    links: links ? undefined : '장소 묶음(Data.p4k)을 훑은 결과가 없어 라그랑주 지점 연결(places)과 containers 를 싣지 못했다. --p4k 로 다시 만들 것.',
});

const out = {
    version: `${build.Branch || ''}.${build.RequestedP4ChangeNum || ''}`.replace(/^sc-alpha-/, ''), gameVersion: build.Version, builtAt: new Date().toISOString(),
    source: 'game-files', sourceHash: createHash('sha256').update(df.buffer).digest('hex'), koSource: ko ? 'korean-patch' : undefined,
    note: '비중과 함량은 게임 파일 값이며 게임 안 실측값이 아니다. '
        + 'share 는 한 묶음(예: 그 장소의 함선 채광 암석들) 안에서 그 암석이 뽑힐 가중치를 백분율로 바꾼 것이지, 가서 보게 될 암석의 비율이 아니다. '
        + '실제로 보이는 수는 묶음 가중치(groups[].weight), 무리 규칙(clusters: 한 번에 몇 개가 모여 나오는지), 지형별 보정(areas), 다시 생기는 시간에 따라 달라진다. '
        + '스캐너에 뜨는 숫자는 rocks[].sig(암석 하나의 기본 RS 시그니처)에 무리의 암석 수를 곱한 값으로 보이지만, 이 규칙은 파일에 없어 게임 안 확인이 필요하다(unknowns.scanner). '
        + '정제 수율 숫자는 게임 파일에 없어 싣지 않았다.',
    unknowns,
    minerals, extraMinerals, locations, sites,
    rocks, clusters, quality,
    harvestables: Object.fromEntries([...harvestables].sort(([x], [y]) => x.localeCompare(y))),
    wrecks: Object.fromEntries([...wrecks].sort(([x], [y]) => x.localeCompare(y))),
    salvageSets: Object.fromEntries(salvageSets),
    special, places, refineries,
};

const comparable = (value) => JSON.stringify({ ...value, builtAt: '' });
const previous = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : null;
const same = previous && comparable(previous) === comparable(out);
const size = JSON.stringify(out).length;
const summary = `채광 자료: 광물 ${minerals.length}종(+특수 ${extraMinerals.length}, 한글 이름 ${minerals.filter((m) => m.name.ko).length}), 장소 ${locations.length}곳(천체 ${locations.filter((l) => l.kind === 'body').length}), 특수 목록 ${sites.length}개, 암석 ${Object.keys(rocks).length}종, 지점 연결 ${places.length}곳, 정제소 ${refineries.length}곳, 크기 ${Math.round(size / 1024)}KB (gzip ${Math.round(zlib.gzipSync(JSON.stringify(out)).length / 1024)}KB)`;
if (CHECK) {
    console.log(same ? `변경 없음. ${summary}` : `저장된 data/mining/helper.json 과 다릅니다. ${summary}`);
    process.exit(same ? 0 : 1);
}
// 내용이 그대로면 builtAt 만 바뀐 파일을 다시 쓰지 않는다.
if (!same) {
    mkdirSync(resolve(ROOT, 'data/mining'), { recursive: true });
    writeFileSync(OUT_PATH, `${JSON.stringify(out)}\n`);
}
console.log(`${same ? '변경 없음. ' : ''}${summary}`);
