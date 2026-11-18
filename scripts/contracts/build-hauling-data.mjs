#!/usr/bin/env node
/**
 * 운송 계약 안내용 자료 — 설치된 게임 파일의 계약 정의(ContractGenerator)에서 운송 평판에 묶인 계약을 뽑는다.
 *
 * 입력(--cache-dir): Game2.dcb, global.ini(영어), build.json.  선택: --ko-ini <한국어 패치 global.ini>
 * 출력: data/contracts/hauling.json
 * 사용: node scripts/contracts/build-hauling-data.mjs --cache-dir <폴더> [--ko-ini <경로>]
 *
 * 값은 게임 파일 그대로다. 서버 설정으로 덮어쓰일 수 있어 게임 안 값과 같다는 보장은 없다.
 * 새 방식 계약에는 보상 금액이 적혀 있지 않다(평판 보상만 있다). 옛 방식 임무(legacy)에만 금액이 있다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataForge } from '../gamedata/dataforge.mjs';
import { haulingCargo } from '../gamedata/guide-extract.mjs';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
const CACHE = arg('--cache-dir');
if (!CACHE || !existsSync(resolve(CACHE, 'Game2.dcb'))) { console.error('--cache-dir <Game2.dcb 가 있는 폴더> 가 필요합니다.'); process.exit(2); }
const df = new DataForge(readFileSync(resolve(CACHE, 'Game2.dcb')));
const manifest = JSON.parse(readFileSync(resolve(CACHE, existsSync(resolve(CACHE, 'build.json')) ? 'build.json' : 'build_manifest.id'), 'utf8'));
const build = manifest.Data || manifest;
function loadIni(path) {
    const map = new Map();
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) { const at = line.indexOf('='); if (at > 0) map.set(line.slice(0, at).replace(/^﻿/, '').replace(/,P$/i, '').trim().toLowerCase(), line.slice(at + 1).trim()); }
    return map;
}
const en = loadIni(resolve(CACHE, 'global.ini'));
const koPath = arg('--ko-ini');
const ko = koPath && existsSync(koPath) ? loadIni(koPath) : null;
const lookup = (map, key) => { if (!map || !key || !String(key).startsWith('@')) return undefined; const value = map.get(String(key).slice(1).toLowerCase()); return value && !/LOC_|PLACEHOLDER|~mission/.test(value) ? value.replace(/<[^>]+>/g, '').trim() : undefined; };
const names = (key, fallback) => { const english = lookup(en, key) || fallback; if (!english) return undefined; const korean = lookup(ko, key); return korean && korean !== english ? { en: english, ko: korean } : { en: english }; };
const short = (ref) => (ref?.name ? String(ref.name).split('.').slice(1).join('.') : undefined);
const idOf = (record) => record.name.split('.').slice(1).join('.');
const prune = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
function findAll(value, test, out = []) {
    if (Array.isArray(value)) { for (const item of value) findAll(item, test, out); return out; }
    if (value && typeof value === 'object') { if (test(value)) out.push(value); for (const item of Object.values(value)) findAll(item, test, out); }
    return out;
}
const byName = (type, depth = 3) => new Map(df.recordsOfType(type).map((record) => [idOf(record), df.readRecord(record, depth)]));

const HAULING_SCOPE = 'ReputationScope_Hauling';
const standings = byName('SReputationStandingParams');
const rewardAmounts = byName('SReputationRewardAmount');
const resourceTypes = byName('ResourceType', 2);
const brokers = new Map(df.recordsOfType('MissionBrokerEntry').map((record) => [idOf(record), record]));
const starmap = new Map(df.recordsOfType('StarMapObject').map((record) => [idOf(record).toLowerCase(), record]));
const missionLocalities = byName('MissionLocality', 2);

// 운송 평판 등급
const scopeRecord = df.recordsOfType('SReputationScopeParams').find((record) => idOf(record) === HAULING_SCOPE);
const scope = df.readRecord(scopeRecord, 5);
const ranks = (scope.standingMap?.standings || []).map((ref) => { const id = short(ref); const s = standings.get(id); return { id, min: s?.minReputation ?? 0, name: names(s?.displayName, id) }; })
    .filter((rank) => rank.min >= 0).sort((a, b) => a.min - b.min);
const rankIndex = new Map(ranks.map((rank, index) => [rank.id, index]));

const resources = {};
const useResource = (id) => { if (!resources[id]) resources[id] = names(resourceTypes.get(id)?.displayName, id); return id; };
const localities = {};
function useLocality(id) {
    if (!localities[id]) {
        // Locality IDs are availability groups, not necessarily StarMapObject IDs.
        // Resolve their actual references; never invent a name from RegionA etc.
        const refs = missionLocalities.get(id)?.availableLocations || [];
        const members = new Map();
        let unresolved = 0;
        for (const ref of refs) {
            const record = starmap.get(short(ref)?.toLowerCase());
            const name = record && names(df.readRecord(record, 2).name);
            if (name) members.set(idOf(record), { id: idOf(record), name });
            else unresolved += 1;
        }
        const direct = starmap.get(id.toLowerCase());
        const name = direct && names(df.readRecord(direct, 2).name);
        localities[id] = prune({ name, members: [...members.values()], unresolved, source: refs.length ? 'MissionLocality.availableLocations' : 'StarMapObject.name' });
    }
    return id;
}
const stringParam = (params, name) => (params?.stringParamOverrides || []).find((p) => p.param === name)?.value;
const intParam = (params, name) => (params?.intParamOverrides || []).find((p) => p.param === name)?.value;
const KINDS = { Hauling_Local: 'local', Hauling_Planetary: 'planetary', Hauling_Solar: 'solar', Hauling_Interstellar: 'interstellar' };

const contractors = {}; const contracts = [];
for (const record of df.recordsOfType('ContractGenerator')) {
    const data = df.readRecord(record, 12);
    for (const generator of data.generators || []) {
        if (short(generator.reputationScope) !== HAULING_SCOPE || generator.notForRelease || generator.workInProgress) continue;
        const faction = short(generator.factionReputation) || 'unknown';
        if (!contractors[faction]) contractors[faction] = names(stringParam(generator.contractParams, 'Contractor'), faction.replace(/^FactionReputation_(Lawful|Unlawful)_/, ''));
        const generatorKind = KINDS[short(generator.contractParams?.missionTypeOverride)] || (/RecoverCargo/i.test(generator.debugName) ? 'recover' : undefined);
        const generatorPlaces = findAll(generator.defaultAvailability, (node) => node.localityAvailable?.name).map((node) => short(node.localityAvailable));
        for (const contract of generator.contracts || []) {
            if (contract.notForRelease || contract.workInProgress) continue;
            const template = short(contract.template) || '';
            const kind = generatorKind || (/RecoverCargo/i.test(template) ? 'recover' : /Interstellar/i.test(contract.debugName) ? 'interstellar' : /Solar/i.test(contract.debugName) ? 'solar' : /Planetary/i.test(contract.debugName) ? 'planetary' : /Local/i.test(contract.debugName) ? 'local' : 'other');
            // Different dropoffs can request identical cargo. Preserve each order,
            // its minimum/maximum and its source instead of merging by quantity.
            const cargo = haulingCargo(contract);
            for (const row of cargo) useResource(row.resource);
            const places = [...new Set([...generatorPlaces, ...findAll(contract, (node) => node.localityAvailable?.name).map((node) => short(node.localityAvailable))])].map(useLocality);
            const reputation = findAll(contract.contractResults, (node) => node.reward?.name && short(node.reputationScope) === HAULING_SCOPE).map((node) => rewardAmounts.get(short(node.reward))?.reputationAmount).filter((amount) => amount > 0);
            contracts.push(prune({
                id: contract.debugName, by: faction, kind,
                min: rankIndex.get(short(contract.minStanding)), max: rankIndex.get(short(contract.maxStanding)),
                minutes: contract.contractResults?.timeToComplete || undefined, cooldown: intParam(contract.paramOverrides, 'PersonalCooldownTime'),
                places, cargo, maxBox: cargo.length ? Math.max(...cargo.map((row) => row.box || 0)) || undefined : undefined,
                rep: reputation.length ? Math.max(...reputation) : undefined, combat: /Combat/i.test(template) || undefined,
            }));
        }
        // 옛 방식 임무: 보상 금액이 적혀 있다.
        for (const legacy of generator.legacyContracts || []) {
            if (legacy.notForRelease || legacy.workInProgress) continue;
            const broker = brokers.get(short(legacy.missionBrokerEntry)); if (!broker) continue;
            const entry = df.readRecord(broker, 4);
            if (!entry.missionReward?.reward) continue;
            contracts.push(prune({ id: legacy.debugName, by: faction, kind: 'legacy', title: names(entry.title), reward: entry.missionReward.reward, minutes: legacy.contractResults?.timeToComplete || undefined }));
        }
    }
}
contracts.sort((a, b) => a.by.localeCompare(b.by) || (a.min ?? 99) - (b.min ?? 99) || a.id.localeCompare(b.id));

const out = {
    version: `${String(build.Branch || '').replace(/^sc-alpha-/, '')}.${build.RequestedP4ChangeNum || ''}`, gameVersion: build.Version, builtAt: new Date().toISOString(),
    source: 'game-files', sourceHash: createHash('sha256').update(df.buffer).digest('hex'),
    note: 'cargo = 원본 주문별 resource, order, min/max SCU, box. max 0은 상한 미확인으로 표시. 계약 min/max = 필요 등급(ranks 순번). 중복 주문을 합치거나 총 화물량을 추정하지 않음. localities = MissionLocality.availableLocations가 참조하는 정식 별지도 이름. 계약 발급 가능 지역이며 출발/도착 경로를 뜻하지 않음.',
    scope: names(scope.displayName, 'Hauling'), ranks, contractors, localities, resources, contracts,
};
mkdirSync(resolve(ROOT, 'data/contracts'), { recursive: true });
writeFileSync(resolve(ROOT, 'data/contracts/hauling.json'), `${JSON.stringify(out)}\n`);
const kinds = contracts.reduce((count, c) => { count[c.kind] = (count[c.kind] || 0) + 1; return count; }, {});
console.log(`운송 계약: ${contracts.length}건 ${JSON.stringify(kinds)}, 의뢰처 ${Object.keys(contractors).length}곳, 등급 ${ranks.length}단계, ${Math.round(JSON.stringify(out).length / 1024)}KB`);
