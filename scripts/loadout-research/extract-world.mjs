// 조사: 물류·무역에 쓸 자료를 게임 원본에서 통째로 뽑는다.
//   node scripts/loadout-research/extract-world.mjs --cache-dir <폴더>
// 출력: data/loadout-research/{contracts,reputation,commodities,cargo-grids,blueprints}.json
// 값은 원본 그대로다. 서버 설정으로 덮어쓰일 수 있어 게임 안 값과 같다는 보장은 없다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { args, requireDir, loadGame, writeData, manifestBase } from './lib.mjs';

const a = args();
const cacheDir = requireDir(a['cache-dir'], 'cache-dir');
const game = loadGame(cacheDir);
const { df } = game;
const base = manifestBase(game);
const short = (ref) => (ref?.name ? String(ref.name).split('.').slice(1).join('.') : undefined);
const round = (value, digits = 3) => (Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : undefined);
const prune = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));

// 영어 이름: global.ini 의 @키 를 풀어 준다.
const ini = new Map();
for (const line of readFileSync(resolve(cacheDir, 'global.ini'), 'utf8').split(/\r?\n/)) {
    const at = line.indexOf('='); if (at < 1) continue;
    ini.set(line.slice(0, at).replace(/^﻿/, '').replace(/,P$/i, '').trim().toLowerCase(), line.slice(at + 1).trim());
}
const text = (key) => { if (!key || !String(key).startsWith('@')) return undefined; const value = ini.get(String(key).slice(1).toLowerCase()); return value && !/^<=|LOC_/.test(value) ? value.replace(/\\n/g, ' ').slice(0, 200) : undefined; };

// 값 트리에서 조건에 맞는 객체를 모두 찾는다.
function findAll(value, test, out = []) {
    if (Array.isArray(value)) { for (const item of value) findAll(item, test, out); return out; }
    if (value && typeof value === 'object') { if (test(value)) out.push(value); for (const item of Object.values(value)) findAll(item, test, out); }
    return out;
}
const byName = (type, depth = 3) => new Map(df.recordsOfType(type).map((record) => [record.name.split('.').slice(1).join('.'), df.readRecord(record, depth)]));

// ---- 평판 ------------------------------------------------------------------
const standings = byName('SReputationStandingParams');
const rewardAmounts = byName('SReputationRewardAmount');
const standingInfo = (ref) => { const id = short(ref); const s = standings.get(id); return id ? prune({ id, min: s?.minReputation, name: text(s?.displayName) }) : undefined; };
const scopes = df.recordsOfType('SReputationScopeParams').map((record) => {
    const scope = df.readRecord(record, 5);
    return prune({
        id: record.name.split('.').slice(1).join('.'), scope: scope.scopeName, name: text(scope.displayName),
        ceiling: scope.standingMap?.reputationCeiling, initial: scope.standingMap?.initialReputation,
        standings: (scope.standingMap?.standings || []).map(standingInfo).filter(Boolean).sort((x, y) => (x.min ?? 0) - (y.min ?? 0)),
    });
});
writeData('reputation.json', { ...base, scopes, rewardAmounts: [...rewardAmounts].map(([id, r]) => ({ id, amount: r.reputationAmount })).sort((x, y) => x.amount - y.amount) });

// ---- 계약 ------------------------------------------------------------------
const brokers = new Map(df.recordsOfType('MissionBrokerEntry').map((record) => [record.name.split('.').slice(1).join('.'), record]));
const brokerInfo = (ref) => {
    const record = brokers.get(short(ref)); if (!record) return undefined;
    const entry = df.readRecord(record, 4);
    return prune({ title: text(entry.title), type: short(entry.type), reward: entry.missionReward?.reward || undefined, currency: entry.missionReward?.reward ? entry.missionReward.currencyType : undefined, difficulty: entry.missionDifficulty });
};
const stringParam = (params, name) => (params?.stringParamOverrides || []).find((p) => p.param === name)?.value;
const intParam = (params, name) => (params?.intParamOverrides || []).find((p) => p.param === name)?.value;
function contractInfo(contract) {
    const orders = findAll(contract, (node) => node.resource?.name && node.maxSCU !== undefined).map((order) => prune({ resource: short(order.resource), maxBox: order.maxContainerSize, minSCU: order.minSCU, maxSCU: order.maxSCU }));
    const reputation = findAll(contract.contractResults, (node) => node.reward?.name && node.factionReputation?.name).map((node) => prune({ faction: short(node.factionReputation), scope: short(node.reputationScope), amount: rewardAmounts.get(short(node.reward))?.reputationAmount }));
    const localities = [...new Set(findAll(contract, (node) => node.localityAvailable?.name).map((node) => short(node.localityAvailable)))];
    const pools = [...new Set(findAll(contract.contractResults, (node) => node.blueprintPool?.name).map((node) => short(node.blueprintPool)))];
    return prune({
        id: contract.debugName, template: short(contract.template), title: text(stringParam(contract.paramOverrides, 'Title')),
        minStanding: standingInfo(contract.minStanding), maxStanding: standingInfo(contract.maxStanding),
        minutes: contract.contractResults?.timeToComplete || undefined, buyIn: contract.contractResults?.contractBuyInAmount || undefined,
        cooldownMinutes: intParam(contract.paramOverrides, 'PersonalCooldownTime'),
        localities, orders, reputation, blueprintPools: pools,
        hidden: contract.notForRelease || contract.workInProgress || undefined,
    });
}
const generators = [];
for (const record of df.recordsOfType('ContractGenerator')) {
    const data = df.readRecord(record, 12);
    for (const generator of data.generators || []) {
        generators.push(prune({
            file: record.file.replace('libs/foundry/records/contracts/contractgenerator/', ''), id: generator.debugName,
            faction: short(generator.factionReputation), scope: short(generator.reputationScope),
            contractor: text(stringParam(generator.contractParams, 'Contractor')), missionType: short(generator.contractParams?.missionTypeOverride),
            requires: (generator.defaultAvailability?.prerequisites || []).filter((p) => p.minStanding?.name).map((p) => prune({ faction: short(p.factionReputation), scope: short(p.scope), min: standingInfo(p.minStanding), max: standingInfo(p.maxStanding) })),
            hidden: generator.notForRelease || generator.workInProgress || undefined,
            contracts: (generator.contracts || []).map(contractInfo),
            legacy: (generator.legacyContracts || []).map((legacy) => prune({ id: legacy.debugName, minutes: legacy.contractResults?.timeToComplete || undefined, ...brokerInfo(legacy.missionBrokerEntry) })),
        }));
    }
}
writeData('contracts.json', { ...base, note: '원본 값. 보상 금액은 옛 방식(legacy) 임무에만 있다.', generators });

// ---- 상품 ------------------------------------------------------------------
const BOXES = { oneSCU: 1, twoSCU: 2, fourSCU: 4, eightSCU: 8, sixteenSCU: 16, twentyFourSCU: 24, thirtyTwoSCU: 32 };
const groupOf = new Map();
for (const record of df.recordsOfType('ResourceTypeGroup')) {
    const group = df.readRecord(record, 3);
    for (const ref of group.resources || group.resourceTypes || []) groupOf.set(short(ref), text(group.displayName) || record.name.split('.').slice(1).join('.'));
}
const commodities = df.recordsOfType('ResourceType').map((record) => {
    const r = df.readRecord(record, 4); const id = record.name.split('.').slice(1).join('.');
    return prune({ id, name: text(r.displayName), group: groupOf.get(id), density: round(r.densityType?.densityUnit?.gramsPerCubicCentimeter), boxes: Object.entries(BOXES).filter(([key]) => r.defaultCargoContainers?.[key]?.name).map(([, size]) => size) });
}).sort((x, y) => x.id.localeCompare(y.id));
writeData('commodities.json', { ...base, commodities });

// ---- 화물칸 ----------------------------------------------------------------
const SCU_EDGE = 1.25;
const containers = byName('InventoryContainer', 5);
const grids = [];
for (const record of game.records) {
    if (!/cargogrid/i.test(record.name)) continue;
    const entity = game.entity(record, 6);
    const ref = short(game.component(entity, 'SCItemInventoryContainerComponentParams')?.containerParams);
    const box = containers.get(ref); const dim = box?.interiorDimensions;
    if (!dim) continue;
    const cells = [dim.x, dim.y, dim.z].map((v) => Math.floor(v / SCU_EDGE + 1e-6));
    grids.push(prune({
        cls: game.clsOf(record), container: ref, dimensions: [round(dim.x, 2), round(dim.y, 2), round(dim.z, 2)], cells, scu: cells[0] * cells[1] * cells[2],
        minItem: box.inventoryType?.minPermittedItemSize ? [box.inventoryType.minPermittedItemSize.x, box.inventoryType.minPermittedItemSize.y, box.inventoryType.minPermittedItemSize.z].map((v) => round(v, 2)) : undefined,
        maxItem: box.inventoryType?.maxPermittedItemSize ? [box.inventoryType.maxPermittedItemSize.x, box.inventoryType.maxPermittedItemSize.y, box.inventoryType.maxPermittedItemSize.z].map((v) => round(v, 2)) : undefined,
    }));
}
writeData('cargo-grids.json', { ...base, note: 'scu = 치수를 1.25m 칸으로 나눈 값. 함선 전체 적재량은 그 함선에 달린 화물칸들의 합이다.', grids: grids.sort((x, y) => x.cls.localeCompare(y.cls)) });

// ---- 제작 설계도 -----------------------------------------------------------
const blueprints = df.recordsOfType('CraftingBlueprintRecord').map((record) => {
    const b = df.readRecord(record, 14).blueprint || {};
    const tier = b.tiers?.[0]?.recipe?.costs || {};
    const time = tier.craftTime || {};
    const seconds = (time.days || 0) * 86400 + (time.hours || 0) * 3600 + (time.minutes || 0) * 60 + (time.seconds || 0);
    const materials = findAll(tier, (node) => node.resource?.name && node.quantity).map((node) => prune({ resource: short(node.resource), scu: round(node.quantity.standardCargoUnits ?? node.quantity.microSCU / 1e6, 4), minQuality: node.minQuality || undefined }));
    const items = findAll(tier, (node) => node.entityClass?.name && node.quantity !== undefined && !node.resource).map((node) => prune({ item: short(node.entityClass), count: typeof node.quantity === 'number' ? node.quantity : undefined }));
    return prune({ id: record.name.split('.').slice(1).join('.'), category: short(b.category), output: short(b.processSpecificData?.entityClass), seconds: seconds || undefined, tiers: b.tiers?.length, materials, items });
}).sort((x, y) => x.id.localeCompare(y.id));
writeData('blueprints.json', { ...base, note: '첫 단계(tiers[0])의 재료만 실었다.', blueprints });

console.log(`평판 범위 ${scopes.length}, 계약 묶음 ${generators.length}(계약 ${generators.reduce((n, g) => n + (g.contracts || []).length + (g.legacy || []).length, 0)}), 상품 ${commodities.length}, 화물칸 ${grids.length}, 설계도 ${blueprints.length}`);
