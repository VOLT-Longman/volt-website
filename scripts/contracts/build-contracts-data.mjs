#!/usr/bin/env node
/**
 * 임무(계약) 전체 자료 — 설치된 게임 파일의 계약 정의에서 직접 뽑는다.
 * Full mission / contract database, derived only from the installed game files.
 *
 * Input (--cache-dir): Game2.dcb, global.ini (English), build.json.  Optional: --ko-ini <Korean patch global.ini>
 * Output: data/contracts/missions.json
 * Usage:  node scripts/contracts/build-contracts-data.mjs --cache-dir <dir> [--ko-ini <path>] [--check]
 *   --check writes nothing and exits 1 when the file on disk differs (builtAt is ignored).
 *
 * Every number is the value stored in the game files. Server configuration can override them.
 * No external service is contacted. Nothing is taken from third-party mission sites.
 *
 * Record chain (record type . field):
 *   ContractGenerator.generators[] -> ContractGeneratorHandler_* (Career / List / LinearSeries / TutorialSeriesDef /
 *   PVPBountyDef / ServiceBeacon / Legacy) -> Contract / CareerContract / ContractLegacy (+ subContracts[])
 *   -> ContractTemplate (defaults) ; ContractLegacy.missionBrokerEntry -> MissionBrokerEntry (old-style missions).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DataForge } from '../gamedata/dataforge.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_PATH = resolve(ROOT, 'data/contracts/missions.json');

export function missionOverview(data) {
    const labels = new Set(data.contracts.flatMap(c => [c.t, c.con]));
    const summary = { ...data, overview: true, texts: data.texts.map((pair, i) => labels.has(i) ? pair : null) };
    for (const key of ['combats', 'spawnGroups', 'tagSets', 'pools', 'blueprints', 'snapshot']) delete summary[key];
    return JSON.stringify(summary) + '\n';
}

// ---------------------------------------------------------------- pure helpers (exported for tests)

/** Korean patch authors append notes such as "<EM4>[BP]</EM4> <EM4>[100 평판]</EM4>" to titles. They are not game text. */
export function stripPatchSuffix(text) {
    return String(text).replace(/(\s*<EM\d>\s*\[[^\]]*\]\s*<\/EM\d>)+\s*$/i, '');
}

/** Localization text -> plain text. "~mission(Location|Address)" becomes the readable placeholder "{Location|Address}". */
export function cleanText(text) {
    return String(text)
        .replace(/\\n/g, '\n')
        .replace(/<[^>\n]{1,24}>/g, '')
        .replace(/~mission\(([^)]*)\)/gi, (_, token) => `{${token.trim()}}`)
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

/**
 * Replace placeholders whose value is fixed in the contract. tokens keys are lower case: "token" or "token|sub".
 * Anything not fixed (chosen when the mission starts) stays as a readable "{Token}" placeholder.
 */
export function fillTokens(text, tokens) {
    return text.replace(/\{([^{}|]+)(?:\|([^{}]*))?\}/g, (whole, token, sub) => tokens[(sub ? `${token}|${sub}` : token).trim().toLowerCase()] || whole);
}

/**
 * Does a location satisfy one DataSetMatchCondition_TagSearch?
 * terms: [{ pos: [tagId], neg: [tagId] }]  (terms are alternatives; inside a term every positive tag is required
 * and no negative tag may be present).  tags: Set of the location's tag ids for the condition's tag type.
 */
export function matchTagSearch(terms, tags) {
    if (!terms.length) return true;
    return terms.some((term) => term.pos.every((id) => tags.has(id)) && !term.neg.some((id) => tags.has(id)));
}

/** Runs needed to climb from `have` reputation to `target` when one run pays `perRun`. null when it cannot be reached. */
export function runsNeeded(have, target, perRun) {
    if (target <= have) return 0;
    return perRun > 0 ? Math.ceil((target - have) / perRun) : null;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

// ---------------------------------------------------------------- builder

function main() {
    const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
    const CHECK = process.argv.includes('--check');
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

    const raw = (map, key) => (map && key && String(key).startsWith('@') ? map.get(String(key).slice(1).toLowerCase()) : undefined);
    const usable = (value) => value && !/^\s*$/.test(value) && !/LOC_(EMPTY|UNINITIALIZED|PLACEHOLDER)|<= ?(UNINITIALIZED|PLACEHOLDER)|^PLACEHOLDER/i.test(value);
    /**
     * {en, ko} for a localization key. ko only when the Korean patch has a different text.
     * When the key has no usable English text and a record id is used instead, the pair is { en: <record id>, raw: 1 }
     * so a screen can tell an internal id from a display name.
     */
    function names(key, fallback, { title = false } = {}) {
        const english = usable(raw(en, key)) ? cleanText(raw(en, key)) : '';
        if (!english) return fallback ? { en: fallback, raw: 1 } : undefined;
        let korean = raw(ko, key);
        korean = usable(korean) ? cleanText(title ? stripPatchSuffix(korean) : korean) : undefined;
        return korean && korean !== english ? { en: english, ko: korean } : { en: english };
    }
    const short = (ref) => (ref?.name ? String(ref.name).split('.').slice(1).join('.') : undefined);
    const idOf = (record) => record.name.split('.').slice(1).join('.');
    const prune = (object) => { const out = {}; for (const [k, v] of Object.entries(object)) if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) out[k] = v; return out; };
    const round = (value, digits = 3) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : undefined);
    function findAll(value, test, out = []) {
        if (Array.isArray(value)) { for (const item of value) findAll(item, test, out); return out; }
        if (value && typeof value === 'object') { if (test(value)) out.push(value); for (const item of Object.values(value)) findAll(item, test, out); }
        return out;
    }
    const recordMap = (type) => new Map(df.recordsOfType(type).map((record) => [idOf(record), record]));
    const lazy = (type, depth) => { const records = recordMap(type); const cache = new Map(); return (id) => { if (!cache.has(id)) { const record = records.get(id); cache.set(id, record ? df.readRecord(record, depth) : null); } return cache.get(id); }; };
    /** Option names of a DataForge enum, in file order (enum definition table). */
    function enumOptions(name) {
        const b = df.buffer;
        for (let i = 0; i < df.counts.enums; i += 1) {
            const o = df.at.enums + i * 8;
            if (df.name(b.readUInt32LE(o)) !== name) continue;
            const count = b.readUInt16LE(o + 4); const first = b.readUInt16LE(o + 6);
            return Array.from({ length: count }, (_, k) => df.name(b.readUInt32LE(df.at.enumOption + (first + k) * 4)));
        }
        return [];
    }

    // ---- shared lookup tables --------------------------------------------------------------
    const tagName = new Map(df.recordsOfType('Tag').map((record) => [record.id, df.readRecord(record, 0).tagName]));
    const tagLabel = (ref) => (ref?.__record ? tagName.get(ref.__record) || ref.__record : undefined);
    const template = lazy('ContractTemplate', 20);
    const standingRecord = lazy('SReputationStandingParams', 1);
    const rewardAmount = lazy('SReputationRewardAmount', 1);
    const factionRecord = lazy('FactionReputation', 1);
    const typeRecord = lazy('MissionType', 1);
    const resourceRecord = lazy('ResourceType', 2);
    const organization = lazy('MissionOrganization', 3);
    const missionItem = lazy('MissionItem', 2);
    const poolRecord = lazy('BlueprintPoolRecord', 3);
    const blueprintRecord = lazy('CraftingBlueprintRecord', 5);
    const scenarioRecord = lazy('MissionScenario', 3);
    const localityRecord = lazy('MissionLocality', 2);
    const haulSetRecord = lazy('Hauling_EntityClasses', 3);
    const brokers = recordMap('MissionBrokerEntry');
    const entityRecords = new Map(df.recordsOfType('EntityClassDefinition').map((record) => [idOf(record).toLowerCase(), record]));
    const starmapRecords = recordMap('StarMapObject');
    const starmap = (() => { const cache = new Map(); return (id) => { if (!cache.has(id)) { const record = starmapRecords.get(id); cache.set(id, record ? df.readRecord(record, 1) : null); } return cache.get(id); }; })();
    const STRING_PARAMS = enumOptions('ContractStringParamType');   // Title, TitleHUD, Description, Contractor, CommsChannelName
    const RESULT_SLOTS = enumOptions('EMissionResult');   // Completed, InProgress, Failed, Abandoned, Withdrawn
    if (RESULT_SLOTS.length !== 5 || RESULT_SLOTS[0] !== 'Completed') throw new Error(`EMissionResult changed: ${RESULT_SLOTS}`);

    const stats = { anomalies: {} };
    const flag = (name) => { stats.anomalies[name] = (stats.anomalies[name] || 0) + 1; };

    // ---- output tables (filled on use) -----------------------------------------------------
    const texts = []; const textIndex = new Map();
    /** Text table index for an {en, ko} pair. Titles and briefings repeat a lot, so contracts hold an index. */
    function useText(pair) {
        if (!pair) return undefined;
        const key = `${pair.en}\u0000${pair.ko || ''}`;
        if (!textIndex.has(key)) { textIndex.set(key, texts.length); texts.push(pair.ko ? [pair.en, pair.ko] : [pair.en]); }
        return textIndex.get(key);
    }
    const types = {}; const factions = {}; const scopes = {}; const localities = {}; const places = {}; const resources = {};
    const items = {}; const pools = {}; const blueprints = {}; const scenarios = {}; const haulSets = {};
    const locations = []; const locationIndex = new Map();
    const tagSets = []; const tagSetIndex = new Map();
    const spawnGroups = []; const spawnGroupIndex = new Map();
    const partials = []; const partialIndex = new Map();
    const combats = []; const combatIndex = new Map();
    const cooldowns = []; const cooldownIndex = new Map();
    const intern = (list, index, value) => { const key = JSON.stringify(value); if (!index.has(key)) { index.set(key, list.length); list.push(value); } return index.get(key); };

    // MissionType.LocalisedTypeName
    function useType(ref) { const id = short(ref); if (id && !types[id]) types[id] = names(typeRecord(id)?.LocalisedTypeName, id); return id; }
    // FactionReputation.displayName
    const factionId = (ref) => short(ref)?.replace(/^FactionReputation_/, '');
    function useFaction(ref) { const id = factionId(ref); if (id && !factions[id]) factions[id] = names(factionRecord(short(ref))?.displayName, id.replace(/^(Lawful|Unlawful)_/, '')); return id; }
    // SReputationScopeParams.standingMap { reputationCeiling, initialReputation, standings[] -> SReputationStandingParams { displayName, minReputation, gated } }
    const scopeRecords = recordMap('SReputationScopeParams');
    const scopeRank = new Map();
    function useScope(ref) {
        const id = short(ref); if (!id) return undefined;
        if (!scopes[id]) {
            const data = scopeRecords.get(id) ? df.readRecord(scopeRecords.get(id), 3) : null;
            const ranks = (data?.standingMap?.standings || []).map((standing) => { const sid = short(standing); const s = standingRecord(sid); return { sid, min: s?.minReputation, name: names(s?.displayName, sid), gated: s?.gated ? 1 : undefined }; })
                .filter((rank) => Number.isFinite(rank.min)).sort((a, b) => a.min - b.min);
            scopeRank.set(id, new Map(ranks.map((rank, index) => [rank.sid, index])));
            scopes[id] = prune({ name: names(data?.displayName, id), ceiling: data?.standingMap?.reputationCeiling, initial: data?.standingMap?.initialReputation, ranks: ranks.map(({ name, min, gated }) => prune({ name, min, gated })) });
        }
        return id;
    }
    /** Rank position (index into scopes[scope].ranks) of a SReputationStandingParams reference. */
    function rankOf(scope, standingRef) {
        const sid = short(standingRef); if (!sid || !scope) return undefined;
        const index = scopeRank.get(scope)?.get(sid);
        if (index === undefined) flag('standingNotInScopeLadder');
        return index;
    }
    // ResourceType.displayName
    function useResource(ref) { const id = short(ref); if (id && !resources[id]) resources[id] = names(resourceRecord(id)?.displayName, id); return id; }
    // EntityClassDefinition.Components[SAttachableComponentParams].AttachDef.Localization.Name
    function useItem(ref) {
        const id = short(ref); if (!id) return undefined;
        if (!items[id]) {
            const record = entityRecords.get(id.toLowerCase());
            const attach = record ? (df.readRecord(record, 4).Components || []).find((c) => c?.__type === 'SAttachableComponentParams') : null;
            items[id] = names(attach?.AttachDef?.Localization?.Name, id);
        }
        return id;
    }
    // StarMapObject.name ; system = top ancestor through StarMapObject.parent (StantonStar / PyroStar / NyxStar)
    function systemOfPlace(id) {
        let current = id; let guard = 0;
        while (starmap(current)?.parent && guard++ < 12) current = short(starmap(current).parent);
        const match = /^(Stanton|Pyro|Nyx)/i.exec(current || '') || /^(Stanton|Pyro|Nyx)/i.exec(id || '');
        return match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : undefined;
    }
    function usePlace(ref) {
        const id = typeof ref === 'string' ? ref : short(ref); if (!id) return undefined;
        if (!places[id]) places[id] = prune({ name: names(starmap(id)?.name), sys: systemOfPlace(id) });
        return id;
    }
    // MissionLocality.availableLocations[] -> StarMapObject
    function useLocality(ref) {
        const id = short(ref); if (!id) return undefined;
        if (!localities[id]) {
            const members = (localityRecord(id)?.availableLocations || []).map(usePlace).filter(Boolean);
            localities[id] = prune({ sys: [...new Set(members.map((member) => places[member].sys).filter(Boolean))], members });
        }
        return id;
    }
    // BlueprintPoolRecord.blueprintRewards[] { weight, blueprintRecord -> CraftingBlueprintRecord.blueprint.processSpecificData.entityClass }
    function usePool(ref) {
        const id = short(ref); if (!id) return undefined;
        if (!pools[id]) {
            pools[id] = (poolRecord(id)?.blueprintRewards || []).map((entry) => {
                // a blueprintRewards entry whose blueprintRecord reference is null stays in the list as [null, weight]
                const bp = short(entry.blueprintRecord); if (!bp) { flag('poolEntryWithoutBlueprint'); return [null, round(entry.weight)]; }
                if (!blueprints[bp]) { const made = findAll(blueprintRecord(bp), (node) => node.__type === 'CraftingProcess_Creation')[0]; blueprints[bp] = (made && items[useItem(made.entityClass)]) || { en: bp, raw: 1 }; }
                return entry.weight === 1 ? bp : [bp, round(entry.weight)];
            });
        }
        return id;
    }
    // MissionScenario { name, schedule.enabled }
    function useScenario(ref) { const id = short(ref); if (id && !scenarios[id]) { const s = scenarioRecord(id); scenarios[id] = prune({ name: s?.name || id, enabledInFile: s?.schedule?.enabled ? 1 : undefined }); } return id; }

    // ---- mission locations (Tag -> MissionLocationTemplate resolver) ------------------------
    // MissionLocationTemplate.locationData { generalTags.tags, producesTags.positiveTags, consumesTags.positiveTags,
    //   stringVariants.variants[{ tag 'Name' | 'Address', string }], disabled }
    const ids = (list) => (list || []).map((ref) => ref?.__record).filter(Boolean);
    const allLocations = df.recordsOfType('MissionLocationTemplate').map((record) => {
        const data = df.readRecord(record, 3).locationData || {};
        const variant = (tag) => (data.stringVariants?.variants || []).find((v) => tagLabel(v.tag) === tag)?.string;
        const general = new Set(ids(data.generalTags?.tags));
        const tagNames = new Set([...general].map((id) => tagName.get(id)));
        return { id: idOf(record), disabled: data.disabled, General: general, Produces: new Set(ids(data.producesTags?.positiveTags)), Consumes: new Set(ids(data.consumesTags?.positiveTags)),
            nameKey: variant('Name'), addressKey: variant('Address'), sys: ['Stanton', 'Pyro', 'Nyx'].find((s) => tagNames.has(s)) };
    }).filter((location) => !location.disabled);
    function useLocation(location) {
        if (!locationIndex.has(location.id)) {
            locationIndex.set(location.id, locations.length);
            const name = names(location.nameKey); const address = names(location.addressKey);
            locations.push(prune({ id: location.id, name, addr: address && address.en !== name?.en ? address : undefined, sys: location.sys }));
        }
        return locationIndex.get(location.id);
    }
    const searchCache = new Map();
    /**
     * Candidate locations for a MissionPropertyValue_Location / _Locations value.
     * Only DataSetMatchCondition_TagSearch can be evaluated from files; the other condition types depend on the
     * live mission (other properties, distance), so they only set `dyn` (= the list is an upper bound).
     */
    function resolveSites(value, swap) {
        const conditions = (value.matchConditions || []).filter(Boolean);
        const searches = conditions.filter((c) => c.__type === 'DataSetMatchCondition_TagSearch' && !c.__ref).map((c) => ({
            type: c.tagType || 'General',
            terms: (c.tagSearch || []).filter((t) => !t.__ref).map((t) => ({ pos: ids(t.positiveTags).map((id) => swap.get(id) || id), neg: ids(t.negativeTags).map((id) => swap.get(id) || id) })).filter((t) => t.pos.length || t.neg.length),
        })).filter((s) => s.terms.length);
        if (!searches.length) return null;
        const key = JSON.stringify(searches);
        if (!searchCache.has(key)) searchCache.set(key, allLocations.filter((location) => searches.every((s) => matchTagSearch(s.terms, location[s.type] || location.General))));
        // q = the search itself in readable form, e.g. "Stanton1+Mining+HasFreightElevator" ("P:" Produces, "C:" Consumes, "-" excluded, "/" alternatives)
        const label = (id) => tagName.get(id) || id;
        const q = searches.map((s) => (s.type === 'General' ? '' : `${s.type[0]}:`) + s.terms.map((t) => t.pos.map(label).join('+') + t.neg.map((id) => `-${label(id)}`).join('')).join('/')).join(' & ');
        const systems = [...new Set(searches.flatMap((s) => s.terms.flatMap((t) => t.pos.map(label))).map((name) => /^(Stanton|Pyro|Nyx)/.exec(name)?.[1]).filter(Boolean))];
        return { found: searchCache.get(key), dyn: conditions.some((c) => c.__type !== 'DataSetMatchCondition_TagSearch'), q, systems };
    }
    const siteHash = (sites) => sites.map((s) => [s.k, s.n, s.at?.map((i) => locations[i].id), s.q === undefined ? undefined : tagSets[s.q], s.dyn, s.need, s.x]);
    const SITE_LIST_LIMIT = 8;   // list candidate names only when a search is this specific

    // ---- property handling -----------------------------------------------------------------
    const propKey = (p, i) => p.missionVariableName || (p.extendedTextToken ? `~${p.extendedTextToken}` : `?${i}`);
    /** Later lists override earlier ones by property name: template defaults < handler < contract < variant. */
    function mergeProps(...lists) {
        const map = new Map();
        for (const list of lists) (list || []).forEach((p, i) => { if (p && !p.__ref) map.set(propKey(p, i), p); });
        return [...map.values()];
    }
    const kindOf = (p) => String(p.value?.__type || '').replace('MissionPropertyValue_', '');
    const roleOf = (name) => (/pick/i.test(name) ? 'pickup' : /drop|deliver|destination/i.test(name) ? 'dropoff' : 'site');
    const single = (value) => { const options = value?.options || []; return options.length === 1 ? options[0] : undefined; };

    function buildSites(props, swap) {
        const seen = new Map(); let pickups = 0; let dropoffs = 0; const systems = new Set();
        for (const p of props) {
            if (!/^Locations?$/.test(kindOf(p))) continue;
            const result = resolveSites(p.value, swap); if (!result) continue;
            const name = p.missionVariableName || p.extendedTextToken || ''; const role = roleOf(name);
            if (role === 'pickup') pickups += 1; else if (role === 'dropoff') dropoffs += 1;
            // n / at only when templates match by their Game2.dcb tags. No match = the tags are added where the location is
            // placed in the world (object containers), which this builder does not read: keep the search text (q) instead.
            const count = result.found.length;
            for (const system of count ? result.found.map((l) => l.sys).filter(Boolean) : result.systems) systems.add(system);
            const site = prune({ k: role, n: count || undefined, at: count && count <= SITE_LIST_LIMIT ? result.found.map(useLocation) : undefined,
                q: count && count <= SITE_LIST_LIMIT ? undefined : intern(tagSets, tagSetIndex, result.q), dyn: result.dyn ? 1 : undefined,
                need: kindOf(p) === 'Locations' && p.value.maxLocationsToFind > 1 ? [p.value.minLocationsToFind, p.value.maxLocationsToFind] : undefined });
            const key = JSON.stringify(site);
            if (seen.has(key)) seen.get(key).x = (seen.get(key).x || 1) + 1; else seen.set(key, site);   // x = how many properties share this search
        }
        return { sites: [...seen.values()], pickups, dropoffs, systems: [...systems] };
    }

    // maxContainerSize as stored: a positive SCU size, or -1 (the most common value: no size set). 0 / missing = omitted.
    const boxOf = (size) => (Number.isFinite(size) && size !== 0 ? size : undefined);
    // HaulingOrderContent_* nodes inside MissionPropertyValue_HaulingOrders.haulingOrderContent[]
    function orderRow(node, props) {
        if (!node || node.__ref) return null;
        const amount = (min, max) => (max > 0 && max !== min ? [min, max] : min);
        switch (node.__type) {
            // HaulingOrderContent_Resource { resource, minSCU, maxSCU, maxContainerSize }
            case 'HaulingOrderContent_Resource': return prune({ r: useResource(node.resource), scu: amount(node.minSCU, node.maxSCU), box: boxOf(node.maxContainerSize) });
            // HaulingOrderContent_EntityClass { entityClass, minAmount, maxAmount }
            case 'HaulingOrderContent_EntityClass': return prune({ e: useItem(node.entityClass), n: amount(node.minAmount, node.maxAmount) });
            // HaulingOrderContent_EntityClasses { haulingEntityClasses -> Hauling_EntityClasses { orderDisplayName, entityClasses.entityClassList[] } }
            case 'HaulingOrderContent_EntityClasses': {
                return prune({ es: useHaulSet(node.haulingEntityClasses), n: amount(node.minAmount, node.maxAmount) });
            }
            // HaulingOrderContent_MissionItem { item -> MissionProperty (MissionPropertyValue_MissionItem), minAmount, maxAmount }
            case 'HaulingOrderContent_MissionItem': {
                const name = node.item?.missionVariableName;
                const prop = props.find((p) => p.missionVariableName === name && kindOf(p) === 'MissionItem') || node.item;
                // DataSetMatchCondition_SpecificItemsDef.items[] -> MissionItem.entityClass
                const classes = [...new Set(findAll(prop?.value, (n) => n.__type === 'DataSetMatchCondition_SpecificItemsDef').flatMap((n) => n.items || []).map((ref) => useItem(missionItem(short(ref))?.entityClass)).filter(Boolean))];
                return prune({ mi: classes.length ? classes : undefined, tagged: classes.length ? undefined : 1, n: amount(node.minAmount, node.maxAmount) });
            }
            // HaulingOrderContent_Or.options[] -> HaulingOrder_OrOption_And.orders[]
            case 'HaulingOrderContent_Or': return { or: (node.options || []).map((option) => (option?.orders || []).map((child) => orderRow(child, props)).filter(Boolean)).filter((rows) => rows.length) };
            default: flag(`order:${node.__type}`); return null;
        }
    }
    /**
     * Orders written straight into a mission flow (MissionBrokerEntry.missionFlow / ContractTemplate.missionFlow):
     *   HaulingOrder_Resource { resource, minSCU, maxSCU, maxContainerSize }, HaulingOrder_EntityClass { entityClass, minAmount, maxAmount },
     *   HaulingOrder_EntityClasses { haulingEntityClasses, minAmount, maxAmount } ; each with pickUpLocation / dropOffLocation property references.
     * The flow repeats one order in several objectives, so identical (cargo, amount, box, pickup, dropoff) rows count once.
     */
    function flowOrders(flow) {
        const amount = (min, max) => (max > 0 && max !== min ? [min, max] : min);
        const unique = new Map();
        for (const node of findAll(flow, (n) => /^HaulingOrder_(Resource|EntityClass|EntityClasses)$/.test(n.__type || '') && !n.__ref)) {
            const from = node.pickUpLocation?.property?.missionVariableName || node.pickUpLocation?.missionVariableName || undefined;
            const to = node.dropOffLocation?.property?.missionVariableName || node.dropOffLocation?.missionVariableName || undefined;
            let row;
            if (node.__type === 'HaulingOrder_Resource') row = { r: useResource(node.resource), scu: amount(node.minSCU, node.maxSCU), box: boxOf(node.maxContainerSize) };
            else if (node.__type === 'HaulingOrder_EntityClass') row = { e: useItem(node.entityClass), n: amount(node.minAmount, node.maxAmount) };
            else row = { es: useHaulSet(node.haulingEntityClasses), n: amount(node.minAmount, node.maxAmount) };
            row = prune({ ...row, from, to });
            if (row.r || row.e || row.es) unique.set(JSON.stringify(row), row);
        }
        return [...unique.values()];
    }
    // Hauling_EntityClasses { orderDisplayName, entityClasses.entityClassList[] }
    function useHaulSet(ref) {
        const id = short(ref);
        if (id && !haulSets[id]) { const set = haulSetRecord(id); haulSets[id] = prune({ name: names(set?.orderDisplayName, id), of: (set?.entityClasses?.entityClassList || []).map(useItem).filter(Boolean) }); }
        return id;
    }
    /** Sum of resource rows: a number, or [min, max] when any row is a range. */
    function totalScu(rows) {
        const low = rows.reduce((sum, row) => sum + (Array.isArray(row.scu) ? row.scu[0] : row.scu || 0), 0);
        const high = rows.reduce((sum, row) => sum + (Array.isArray(row.scu) ? row.scu[1] : row.scu || 0), 0);
        return low > 0 ? (high !== low ? [round(low, 2), round(high, 2)] : round(low, 2)) : undefined;
    }
    function buildHaul(props, flow) {
        const orders = [];
        for (const p of props) {
            if (kindOf(p) !== 'HaulingOrders') continue;
            const rows = (p.value.haulingOrderContent || []).map((node) => orderRow(node, props)).filter(Boolean);
            if (rows.length) orders.push({ p: p.missionVariableName || p.extendedTextToken, rows });
        }
        // Orders written into the mission flow are used only when no order property exists (one contract carries the same
        // cargo in both places; adding them would count it twice).
        const fixedRows = flow && !orders.length ? flowOrders(flow) : [];
        if (fixedRows.length) orders.push({ p: 'missionFlow', rows: fixedRows });
        if (!orders.length) return undefined;
        // Some templates list the same cargo once per pickup and once per dropoff; total only one side.
        const hasDrop = orders.some((o) => /ForDropoff/i.test(o.p));
        const counted = orders.filter((o) => !(hasDrop && /ForPickup/i.test(o.p)));
        const flat = counted.flatMap((o) => o.rows);
        const fixed = flat.every((row) => !row.or);
        const scu = totalScu(flat.filter((row) => row.r));
        const boxes = orders.flatMap((o) => o.rows).flatMap((row) => (row.or ? row.or.flat() : [row])).map((row) => row.box).filter((box) => box > 0);
        return prune({ orders, scu: fixed ? scu : undefined, maxBox: boxes.length ? Math.max(...boxes) : undefined });
    }

    // SpawnDescription_Ship.tags -> sorted tag-name list, interned
    const tagSet = (list) => intern(tagSets, tagSetIndex, (list?.tags || []).map(tagLabel).filter(Boolean).join('|'));
    function buildCombat(props) {
        const ships = []; const npcs = []; const creatures = []; const nums = {};
        for (const p of props) {
            const kind = kindOf(p); const name = p.missionVariableName || p.extendedTextToken;
            if (kind === 'ShipSpawnDescriptions') {
                // MissionPropertyValue_ShipSpawnDescriptions.spawnDescriptions[] SpawnDescription_ShipGroup { Name, ships[] SpawnDescription_ShipOptions.options[] SpawnDescription_Ship { tags, concurrentAmount, weight } }
                const groups = (p.value.spawnDescriptions || []).map((group) => {
                    const slots = (group.ships || []).map((slot) => {
                        const options = (slot.options || []).map((ship) => [ship.concurrentAmount, tagSet(ship.tags), round(ship.weight)]);
                        return options.length === 1 ? options[0].slice(0, 2) : options.length ? { alt: options } : null;
                    }).filter(Boolean);
                    return slots.length ? intern(spawnGroups, spawnGroupIndex, prune({ n: group.Name || undefined, s: slots })) : null;
                }).filter((g) => g !== null);
                if (groups.length) ships.push({ p: name, g: groups });
            } else if (kind === 'NPCSpawnDescriptions') {
                // SpawnDescription_NPC_Group { Name, options[] SpawnDescription_NPCOption { autoSpawnSettings { positiveCharacterTags, minGroupSize, maxGroupSize, maxConcurrentSpawns, maxSpawns }, identifierTags, weight } }
                const groups = (p.value.spawnDescriptions || []).map((group) => {
                    const options = (group.options || []).map((o) => { const a = o.autoSpawnSettings || {}; return [tagSet(a.positiveCharacterTags), a.minGroupSize, a.maxGroupSize, a.maxConcurrentSpawns, a.maxSpawns]; });
                    const distinct = [...new Map(options.map((o) => [JSON.stringify(o), o])).values()];
                    return options.length ? prune({ n: group.Name || undefined, opts: options.length, o: distinct }) : null;
                }).filter(Boolean);
                if (groups.length) npcs.push({ p: name, g: groups });
            } else if (kind === 'EntitySpawnDescriptions') {
                // SpawnDescription_EntityGroup { Name, entities[] SpawnDescription_EntityOptions.options[] SpawnDescription_Entity { tags, amount, weight } }
                const groups = (p.value.spawnDescriptions || []).map((group) => {
                    const slots = (group.entities || []).map((slot) => { const options = (slot.options || []).map((e) => [e.amount, tagSet(e.tags), round(e.weight)]); return options.length === 1 ? options[0].slice(0, 2) : options.length ? { alt: options } : null; }).filter(Boolean);
                    return slots.length ? prune({ n: group.Name || undefined, s: slots }) : null;
                }).filter(Boolean);
                if (groups.length) creatures.push({ p: name, g: groups });
            } else if ((kind === 'Integer' || kind === 'Float') && name && COMBAT_NUMBER.test(name)) {
                // MissionPropertyValue_Integer / _Float .options[0] { value, variation } (single option only)
                const option = single(p.value);
                if (option && Number.isFinite(option.value)) nums[name.replace(/_BP$/, '')] = option.variation ? [round(option.value), round(option.variation)] : round(option.value);
            }
        }
        if (!ships.length && !npcs.length && !creatures.length) return undefined;
        return intern(combats, combatIndex, prune({ ships, npcs, creatures, nums }));
    }
    const COMBAT_NUMBER = /(AcePilotChance|ReinforcementChance|ReinforcementsSpawnChance|ChanceOfReinforcements|InterdictionChance|AmbushChance|PercentageChanceOfEncounter|NumberOfWaves|MaxWaves|Wave\d+Count|MaxShips|WaveDelay|TotalToKill|EndModuleWhenXKilled|NumberOfChildMissions|ZonesToDefend|NumberOfSearchs)/i;

    // ContractPrerequisite_* lists (handler.defaultAvailability.prerequisites, contract.additionalPrerequisites, subContract.additionalPrerequisites)
    function buildPrerequisites(list) {
        const out = { loc: [], at: [], done: [], rep: [] };
        for (const node of list || []) {
            if (!node || node.__ref) continue;
            switch (node.__type) {
                case 'ContractPrerequisite_Locality': { const id = useLocality(node.localityAvailable); if (id && !out.loc.includes(id)) out.loc.push(id); break; }
                case 'ContractPrerequisite_Location': { const id = usePlace(node.locationAvailable); if (id && !out.at.includes(id)) out.at.push(id); break; }
                // requiredCompletedContractTags / requiredCountValue / excludedCompletedContractTags / excludedCountValue
                case 'ContractPrerequisite_CompletedContractTags': {
                    const need = (node.requiredCompletedContractTags?.tags || []).map(tagLabel).filter(Boolean); const not = (node.excludedCompletedContractTags?.tags || []).map(tagLabel).filter(Boolean);
                    if (need.length || not.length) out.done.push(prune({ need, n: need.length && node.requiredCountValue !== 1 ? node.requiredCountValue : undefined, not, notN: not.length && node.excludedCountValue !== 1 ? node.excludedCountValue : undefined }));
                    break;
                }
                // factionReputation, scope, minStanding, maxStanding, exclude
                case 'ContractPrerequisite_Reputation': { const s = useScope(node.scope); out.rep.push(prune({ f: useFaction(node.factionReputation), s, min: rankOf(s, node.minStanding), max: rankOf(s, node.maxStanding), ex: node.exclude ? 1 : undefined })); break; }
                // minCrimeStat, maxCrimeStat
                case 'ContractPrerequisite_CrimeStat': out.crime = [round(node.minCrimeStat), round(node.maxCrimeStat)]; break;
                case 'ContractPrerequisite_LocationProperty': break;   // runtime check against a chosen location
                default: flag(`prerequisite:${node.__type}`);
            }
        }
        return out;
    }
    const dedupe = (list) => [...new Map(list.map((item) => [JSON.stringify(item), item])).values()];

    /** missionResults (Boolean[5]) -> indexes of the slots that are set. */
    const slotList = (slots) => (slots || []).map((hit, i) => (hit ? i : -1)).filter((i) => i >= 0);
    // SReputationAmountParams { factionReputation, reputationScope, reward -> SReputationRewardAmount.reputationAmount }
    function repEntry(amounts, slots) {
        const amount = rewardAmount(short(amounts?.reward))?.reputationAmount;
        if (!Number.isFinite(amount)) return null;
        const on = slotList(slots);
        const entry = prune({ f: useFaction(amounts.factionReputation), s: useScope(amounts.reputationScope), n: amount });
        // on: absent = Completed only ; [] = the file sets no result slot at all (so not a completion reward) ; else slot indexes
        if (!(on.length === 1 && on[0] === 0)) entry.on = on;
        return entry;
    }

    // PartialContractRewards.percentageThresholds[] { minPercentage, maxPercentage, currencyRewardMultiplier, reputationMultipliers[] }
    function usePartial(node) {
        const rows = (node?.percentageThresholds || []).map((t) => prune({ from: t.minPercentage, to: t.maxPercentage, pay: round(t.currencyRewardMultiplier), rep: Object.fromEntries((t.reputationMultipliers || []).map((m) => [useScope(m.reputationScope), round(m.reputationRewardMultiplier)]).filter(([s]) => s)) }));
        return rows.length ? intern(partials, partialIndex, rows) : undefined;
    }

    const stringParam = (params, name) => (params?.stringParamOverrides || []).find((p) => p.param === name)?.value;
    const boolParam = (params, name) => (params?.boolParamOverrides || []).find((p) => p.param === name)?.value;
    const intParam = (params, name) => (params?.intParamOverrides || []).find((p) => p.param === name)?.value;
    const first = (...values) => values.find((value) => value !== undefined && value !== null);
    const level = (text) => { const match = /_(\d)$/.exec(text || ''); return match ? Number(match[1]) : undefined; };
    /**
     * Fixed text tokens: properties with extendedTextToken whose value is one MissionPropertyValue_StringHash option (textId),
     * or one fixed MissionOrganization. Result: token key -> list of { en, ko }. Several entries = the organization has
     * several string variants for that tag (MissionOrganization.stringVariants.variants[]; the file gives no weights).
     */
    function tokenTexts(props) {
        const out = {};
        const add = (key, pair) => { if (pair) { if (!out[key]) out[key] = []; out[key].push({ en: pair.en, ko: pair.ko || pair.en }); } };
        for (const p of props) {
            if (!p.extendedTextToken) continue;
            const token = p.extendedTextToken.toLowerCase();
            if (kindOf(p) === 'StringHash') {
                const option = single(p.value); if (option) { delete out[token]; add(token, names(option.textId, undefined, { title: true })); }
            } else if (kindOf(p) === 'Organization') {
                // one fixed MissionOrganization -> its stringVariants.variants[{ tag, string }] answer "{Contractor|<tag>}"
                const orgs = [...new Set(findAll(p.value, (n) => n.__type === 'DataSetMatchCondition_SpecificOrganizationsDef').flatMap((n) => n.organizations || []).map(short).filter(Boolean))];
                if (orgs.length !== 1) continue;
                for (const key of Object.keys(out)) if (key.startsWith(`${token}|`)) delete out[key];
                for (const variant of organization(orgs[0])?.stringVariants?.variants || []) {
                    const sub = tagLabel(variant.tag);
                    if (sub) add(`${token}|${sub.toLowerCase()}`, names(variant.string, undefined, { title: true }));
                }
            }
        }
        for (const key of Object.keys(out)) out[key] = [...new Map(out[key].map((pair) => [pair.en, pair])).values()];
        return out;
    }
    /**
     * Text for a localization key with the fixed placeholders filled, in both languages.
     * Returns { main, alt[] }: main uses the first variant of every placeholder (file order); alt holds the other texts
     * the same contract can show (variant k of each varying placeholder). Korean is built from the Korean template when
     * the patch has one, otherwise from the English template, always with the Korean placeholder values.
     */
    function filledText(key, tokens, { title = false } = {}) {
        const pair = names(key, undefined, { title }); if (!pair) return undefined;
        const used = [...pair.en.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].split('|').map((part) => part.trim()).join('|').toLowerCase()).filter((token) => tokens[token]);
        const variants = Math.max(1, ...used.map((token) => tokens[token].length));
        const make = (k) => {
            const at = (lang) => Object.fromEntries(Object.entries(tokens).map(([token, list]) => [token, list[k % list.length][lang]]));
            const twice = (text, map) => fillTokens(fillTokens(text, map), map);   // a filled text may itself hold a fixed placeholder
            const english = twice(pair.en, at('en')); const korean = twice(pair.ko || pair.en, at('ko'));
            return korean !== english ? { en: english, ko: korean } : { en: english };
        };
        const main = make(0);
        const alt = [...new Map(Array.from({ length: variants - 1 }, (_, k) => make(k + 1)).filter((v) => v.en !== main.en).map((v) => [v.en, v])).values()];
        return { main, alt };
    }
    /** true when a text is nothing but placeholders the files do not fix (e.g. "{Contractor|OpenBountyDescription}"). */
    const placeholderOnly = (pair) => !!pair && /^(\s*\{[^{}]*\}\s*)+$/.test(pair.en);

    /** Combat content with table indexes replaced by their values, so the hash does not depend on table order. */
    function combatHash(combat) {
        const slot = (entry) => (entry.alt ? entry.alt.map((o) => [o[0], tagSets[o[1]], o[2]]) : [entry[0], tagSets[entry[1]]]);
        return [combat.nums, (combat.ships || []).map((s) => [s.p, s.g.map((g) => [spawnGroups[g].n, spawnGroups[g].s.map(slot)])]),
            (combat.npcs || []).map((n) => [n.p, n.g.map((g) => [g.n, g.opts, g.o.map((o) => [tagSets[o[0]], ...o.slice(1)])])]), (combat.creatures || []).map((n) => [n.p, n.g.map((g) => [g.n, g.s.map(slot)])])];
    }
    const SOURCE = { 'ContractGeneratorHandler_Career.contracts': 'career', 'ContractGeneratorHandler_Career.introContracts': 'intro', 'ContractGeneratorHandler_List.contracts': 'list',
        'ContractGeneratorHandler_LinearSeries.contracts': 'series', 'ContractGeneratorHandler_TutorialSeriesDef.contracts': 'tutorial', 'ContractGeneratorHandler_PVPBountyDef.PVPBountyContract': 'pvp',
        'ContractGeneratorHandler_ServiceBeacon.serviceBeaconContracts': 'beacon', 'ContractGeneratorHandler_Legacy.legacyContracts': 'legacy' };

    const rows = [];   // { out: compact contract, hashed: values used for the content hash }
    let variantCount = 0;

    for (const record of df.recordsOfType('ContractGenerator')) {
        const data = df.readRecord(record, 20);
        for (const handler of data.generators || []) {
            if (!handler || handler.notForRelease || handler.workInProgress) continue;
            const availability = handler.defaultAvailability || {};
            const handlerParams = handler.contractParams || {};
            for (const listName of ['contracts', 'introContracts', 'PVPBountyContract', 'serviceBeaconContracts', 'legacyContracts']) {
                for (const contract of handler[listName] || []) {
                    if (!contract || contract.notForRelease || contract.workInProgress) continue;
                    const src = SOURCE[`${handler.__type}.${listName}`] || 'other';
                    const events = [...new Set([...(data.required_active_scenarios || []), ...(handler.required_active_scenarios || []), ...(contract.required_active_scenarios || [])].map(useScenario).filter(Boolean))];
                    if (src === 'legacy') { const row = legacyRow(contract, events); if (row) rows.push(row); continue; }

                    const params = contract.paramOverrides || {};
                    const tmplId = short(contract.template); const tmpl = tmplId ? template(tmplId) : null;
                    if (!tmpl) flag('templateMissing'); else if (tmpl.notForRelease || tmpl.workInProgress) flag('templateFlaggedNotForRelease');
                    const display = tmpl?.contractDisplayInfo || {};
                    const baseProps = mergeProps(tmpl?.contractProperties, handlerParams.propertyOverrides, params.propertyOverrides);
                    const tokens = tokenTexts(baseProps);

                    // --- identity and text: ContractStringParam Title / Description / Contractor (contract, then handler)
                    //     else ContractTemplate.contractDisplayInfo.displayString[] (indexed like the ContractStringParamType enum)
                    const templateString = (name) => { const key = (display.displayString || [])[STRING_PARAMS.indexOf(name)]; return usable(raw(en, key)) ? key : undefined; };
                    const titleKey = first(stringParam(params, 'Title'), stringParam(handlerParams, 'Title'), templateString('Title'));
                    const descKey = first(stringParam(params, 'Description'), stringParam(handlerParams, 'Description'), templateString('Description'));
                    const titled = filledText(titleKey, tokens, { title: true }); const described = filledText(descKey, tokens);
                    const title = titled?.main; const description = described?.main;
                    const contractor = names(first(stringParam(params, 'Contractor'), stringParam(handlerParams, 'Contractor'), templateString('Contractor')));
                    // --- type: ContractParamOverrides.missionTypeOverride (contract, handler) else ContractTemplate.contractDisplayInfo.type
                    const type = useType(first(params.missionTypeOverride, handlerParams.missionTypeOverride, display.type));

                    // --- results: ContractResults.contractResults[]
                    const results = (contract.contractResults?.contractResults || []).filter(Boolean);
                    const slotsOf = (node) => node.missionResults || [];
                    const rep = []; const bp = []; const itemRewards = []; const weighted = []; const gives = []; let pay; let points; let rental; let refund;
                    // res = results the file does not attach to "Completed" alone: [kind, [slot indexes], ...payload].
                    //   [] = missionResults all false (the file ties the result to no outcome; never shown as a reward).
                    const res = [];
                    for (const node of results) {
                        const on = slotList(node.missionResults);
                        const completed = on.length === 1 && on[0] === 0;
                        // reputation and blueprint results carry their slot themselves (rep[].on, bp[][2]); every other result
                        // that is not "Completed only" goes to res instead of the normal reward fields
                        if (!completed && node.__type !== 'ContractResult_LegacyReputation' && !(node.__type === 'BlueprintRewards' && on.length === 1)) {
                            const kind = String(node.__type).replace(/^ContractResult_/, '');
                            if (kind === 'JournalEntry' || kind === 'BadgeAward') continue;
                            if (kind === 'CalculatedReward' || kind === 'CompletionBounty') res.push(['pay', on, 'calc']);
                            else if (kind === 'Reward') res.push(['pay', on, node.contractReward?.reward]);
                            else if (kind === 'Item') res.push(['item', on, useItem(node.entityClass), node.amount]);
                            else if (kind === 'CompletionTags') res.push(['tags', on, (node.completionTags || []).map((t) => tagLabel(t.tag)).filter(Boolean)]);
                            else if (kind === 'RefundBuyIn') res.push(['refund', on, round(node.refundMultiplier)]);
                            else if (kind === 'BlueprintRewards') res.push(['bp', on, usePool(node.blueprintPool), round(node.chance)]);
                            else res.push([kind, on]);
                            flag(on.length ? 'resultOnOtherSlot' : 'resultWithoutSlot');
                            continue;
                        }
                        switch (node.__type) {
                            // ContractResult_CalculatedReward / _CompletionBounty: no amount field exists in the struct
                            case 'ContractResult_CalculatedReward': case 'ContractResult_CompletionBounty': pay = pay || 'calc'; break;
                            // ContractResult_Reward.contractReward (MissionReward { reward, max, currencyType })
                            case 'ContractResult_Reward': if (node.contractReward?.reward > 0) pay = prune({ a: node.contractReward.reward, max: node.contractReward.max > 0 ? node.contractReward.max : undefined, cur: node.contractReward.currencyType }); break;
                            case 'ContractResult_LegacyReputation': { const entry = repEntry(node.contractResultReputationAmounts, slotsOf(node)); if (entry) { rep.push(entry); if (entry.on && !entry.on.length) flag('resultWithoutSlot'); } break; }
                            // ContractResult_CalculatedReputation { factionReputation, reputationScope }: amount not stored
                            case 'ContractResult_CalculatedReputation': rep.push(prune({ f: useFaction(node.factionReputation), s: useScope(node.reputationScope), calc: 1 })); break;
                            // BlueprintRewards { chance, blueprintPool }
                            case 'BlueprintRewards': { const pool = usePool(node.blueprintPool); if (pool) bp.push(completed ? [pool, round(node.chance)] : [pool, round(node.chance), on[0]]); break; }
                            // ContractResult_Item { entityClass, amount }
                            case 'ContractResult_Item': { const id = useItem(node.entityClass); if (id) itemRewards.push([id, node.amount]); break; }
                            // ContractResult_ItemsWeighting.itemAwardStructure[] ItemAwardWeightings { weighting, awards[] ItemAwardEntityClass { amountToAward, entityClass } }
                            case 'ContractResult_ItemsWeighting': for (const option of findAll(node.itemAwardStructure, (n) => n.__type === 'ItemAwardWeightings')) { const awards = (option.awards || []).map((a) => [useItem(a?.entityClass), a?.amountToAward]).filter(([id]) => id); if (awards.length) weighted.push([round(option.weighting), awards]); } break;
                            // ContractResult_CompletionTags.completionTags[] { tag, count }
                            case 'ContractResult_CompletionTags': for (const t of node.completionTags || []) { const label = tagLabel(t.tag); if (label) gives.push(t.count > 1 ? [label, t.count] : label); } break;
                            // ContractResult_ScenarioProgress.PointsToAward
                            case 'ContractResult_ScenarioProgress': if (node.PointsToAward) points = node.PointsToAward; break;
                            // ContractResult_VehicleRental { vehicleEntityClass, durationMinutes }
                            case 'ContractResult_VehicleRental': rental = [useItem(node.vehicleEntityClass), node.durationMinutes]; break;
                            // ContractResult_RefundBuyIn.refundMultiplier
                            case 'ContractResult_RefundBuyIn': refund = round(node.refundMultiplier); break;
                            case 'ContractResult_JournalEntry': case 'ContractResult_BadgeAward': break;
                            default: flag(`result:${node.__type}`);
                        }
                    }
                    if (!pay) pay = 'none';

                    // --- faction / scope / standing
                    const scope = useScope(handler.reputationScope);
                    let by = useFaction(handler.factionReputation); let bySrc;
                    if (!by) {
                        const paid = [...new Set(rep.filter((r) => r.n > 0 && !r.on).map((r) => r.f))];
                        // Not a career handler: the faction is taken only from the single faction this contract pays reputation to.
                        if (paid.length === 1) { by = paid[0]; bySrc = 'rep'; }
                    }
                    const min = rankOf(scope, contract.minStanding); const max = rankOf(scope, contract.maxStanding);

                    // --- availability flags
                    // Illegal: ContractBoolParam (contract, handler) else ContractTemplate.contractDisplayInfo.illegal
                    const illegal = first(boolParam(params, 'Illegal'), boolParam(handlerParams, 'Illegal'), display.illegal);
                    // OnceOnly: ContractBoolParam else ContractAvailability.onceOnly
                    const once = first(boolParam(params, 'OnceOnly'), boolParam(handlerParams, 'OnceOnly'), availability.onceOnly);
                    // CanBeShared: ContractBoolParam else ContractTemplate.contractClass(ContractClass_Contract).additionalParams.canBeShared
                    const shareParam = first(boolParam(params, 'CanBeShared'), boolParam(handlerParams, 'CanBeShared'));
                    const shareDefault = tmpl?.contractClass?.__type === 'ContractClass_Contract' ? tmpl.contractClass.additionalParams?.canBeShared : undefined;
                    const share = first(shareParam, shareDefault);
                    // MaxPlayersPerInstance: ContractIntParam else ContractAvailability.maxPlayersPerInstance
                    const players = first(intParam(params, 'MaxPlayersPerInstance'), intParam(handlerParams, 'MaxPlayersPerInstance'), availability.maxPlayersPerInstance);
                    // cooldowns: ContractBoolParam HasPersonalCooldown / ContractIntParam PersonalCooldownTime(+Variation), AbandonedCooldownTime(+Variation)
                    //   else ContractAvailability.{hasPersonalCooldown, personalCooldownTime, ...}. Minutes (see units).
                    const pick = (name, field) => { const explicit = first(intParam(params, name), intParam(handlerParams, name)); return { value: first(explicit, availability[field]), explicit: explicit !== undefined }; };
                    const hasCooldown = first(boolParam(params, 'HasPersonalCooldown'), boolParam(handlerParams, 'HasPersonalCooldown'), availability.hasPersonalCooldown);
                    const personal = pick('PersonalCooldownTime', 'personalCooldownTime'); const personalVar = pick('PersonalCooldownTimeVariation', 'personalCooldownTimeVariation');
                    const abandoned = pick('AbandonedCooldownTime', 'abandonedCooldownTime'); const abandonedVar = pick('AbandonedCooldownTimeVariation', 'abandonedCooldownTimeVariation');
                    const showPersonal = hasCooldown || personal.explicit;
                    const cd = prune({ on: hasCooldown ? 1 : showPersonal ? 0 : undefined, p: showPersonal ? round(personal.value) : undefined, pv: showPersonal && personalVar.value ? round(personalVar.value) : undefined,
                        a: round(abandoned.value), av: abandonedVar.value ? round(abandonedVar.value) : undefined,
                        ra: first(boolParam(params, 'CanReacceptAfterAbandoning'), boolParam(handlerParams, 'CanReacceptAfterAbandoning'), availability.canReacceptAfterAbandoning) ? 1 : 0,
                        rf: first(boolParam(params, 'CanReacceptAfterFailing'), boolParam(handlerParams, 'CanReacceptAfterFailing'), availability.canReacceptAfterFailing) ? 1 : 0 });

                    // --- payout inputs: ContractResults.timeToComplete (ContractIntParam TimeToComplete overrides), ContractResults.difficulty (ContractDifficulty)
                    const time = first(intParam(params, 'TimeToComplete'), intParam(handlerParams, 'TimeToComplete'), contract.contractResults?.timeToComplete);
                    const difficulty = contract.contractResults?.difficulty;
                    const diff = difficulty ? [short(difficulty.difficultyProfile), level(difficulty.mechanicalSkill), level(difficulty.mentalLoad), level(difficulty.riskOfLoss), level(difficulty.gameKnowledge)] : undefined;
                    if (diff && diff.slice(1).some((value) => value === undefined)) flag('difficultyLevelUnreadable');
                    // ContractTemplate.contractClass.autoFinishSettings.contractDeadline.missionCompletionTime
                    const deadline = tmpl?.contractClass?.autoFinishSettings?.contractDeadline;

                    // --- prerequisites, sites, cargo, combat
                    const pre = buildPrerequisites([...(availability.prerequisites || []), ...(contract.additionalPrerequisites || [])]);
                    const noSwap = new Map();
                    const site = buildSites(baseProps, noSwap); const haul = buildHaul(baseProps, tmpl?.missionFlow); const combat = buildCombat(baseProps);
                    if (haul) Object.assign(haul, prune({ pickups: site.pickups || undefined, dropoffs: site.dropoffs || undefined }));

                    // --- variants: SubContract (ContractParamOverrides + id + additionalPrerequisites + propertyTagReplacement)
                    const variants = (contract.subContracts || []).filter(Boolean).map((sub) => {
                        const swap = new Map((sub.propertyTagReplacement || []).filter((r) => r.templateTag?.__record && r.replacementTag?.__record).map((r) => [r.templateTag.__record, r.replacementTag.__record]));
                        const props = mergeProps(baseProps, sub.propertyOverrides);
                        const subPre = buildPrerequisites(sub.additionalPrerequisites);
                        const subSite = buildSites(props, swap); const subHaul = (sub.propertyOverrides || []).some((p) => kindOf(p) === 'HaulingOrders') ? buildHaul(props) : undefined;
                        const subTokens = (sub.propertyOverrides || []).length ? tokenTexts(props) : tokens;
                        const subTitled = stringParam(sub, 'Title') ? filledText(stringParam(sub, 'Title'), subTokens, { title: true }) : undefined;
                        const subDescribed = stringParam(sub, 'Description') ? filledText(stringParam(sub, 'Description'), subTokens) : undefined;
                        const subTitle = subTitled?.main; const subDesc = subDescribed?.main;
                        const sitesDiffer = JSON.stringify(subSite.sites) !== JSON.stringify(site.sites);
                        const systems = [...new Set([...subPre.loc.flatMap((id) => localities[id].sys || []), ...subPre.at.map((id) => places[id].sys).filter(Boolean)])];
                        return { systems, siteSystems: systems.length ? [] : subSite.systems, hashed: [sub.id, subTitle?.en, stringParam(sub, 'Description'), subPre, siteHash(subSite.sites), subHaul, [...swap].map(([from, to]) => [tagName.get(from), tagName.get(to)])],
                            out: prune({ id: sub.id, swap: [...swap].map(([from, to]) => [tagName.get(from), tagName.get(to)]), t: useText(subTitle), tAlt: subTitled?.alt.map(useText), d: useText(subDesc), dAlt: subDescribed?.alt.map(useText), dRaw: placeholderOnly(subDesc) ? 1 : undefined, type: sub.missionTypeOverride ? useType(sub.missionTypeOverride) : undefined, loc: subPre.loc, at: subPre.at,
                                done: subPre.done, rep: subPre.rep, sites: sitesDiffer ? subSite.sites : undefined, haul: subHaul,
                                illegal: boolParam(sub, 'Illegal') === undefined ? undefined : boolParam(sub, 'Illegal') ? 1 : 0, once: boolParam(sub, 'OnceOnly') === undefined ? undefined : boolParam(sub, 'OnceOnly') ? 1 : 0 }) };
                    });
                    variantCount += variants.length;

                    // --- star systems: prerequisites first (Locality / Location), mission sites only as a fallback
                    //     sysBy: absent = every system comes from a Locality / Location prerequisite (contract, handler or variant)
                    //            'sites' = none does: all come from the tags of the mission-site searches
                    //            'mixed' = some variants have a prerequisite, the systems of the others come from their site tags
                    const preSys = [...new Set([...pre.loc.flatMap((id) => localities[id].sys || []), ...pre.at.map((id) => places[id].sys).filter(Boolean), ...variants.flatMap((v) => v.systems)])];
                    // variants without a prerequisite of their own add the systems named by their site-search tags
                    const variantSiteSys = [...new Set(variants.flatMap((v) => v.siteSystems))];
                    let sys = preSys; let sysBy;
                    if (!preSys.length) { sys = variantSiteSys.length ? variantSiteSys : site.systems; if (sys.length) sysBy = 'sites'; }
                    else if (variantSiteSys.some((system) => !preSys.includes(system))) { sys = [...new Set([...preSys, ...variantSiteSys])]; sysBy = 'mixed'; }
                    sys = [...sys].sort();

                    // --- data oddities (neutral flags; not checked in game)
                    const odd = [];
                    if (!tmpl) odd.push('templateMissing'); else if (tmpl.notForRelease || tmpl.workInProgress) odd.push('templateNotForRelease');
                    if (src === 'career' && min !== undefined && !rep.some((r) => r.n > 0 && !r.on)) odd.push('rankButNoRep');
                    if (res.some((entry) => !entry[1].length) || rep.some((r) => r.on && !r.on.length)) odd.push('resultNoSlot');
                    if (handler.factionReputation && rep.some((r) => r.n > 0 && !r.on && r.s === scope && r.f !== by)) odd.push('repOtherFaction');

                    const out = prune({
                        id: contract.id, n: contract.debugName, src, t: useText(title), tAlt: titled?.alt.map(useText), d: useText(description), dAlt: described?.alt.map(useText), dRaw: placeholderOnly(description) ? 1 : undefined, type, tmpl: tmplId, by, bySrc, con: useText(contractor), scope,
                        sys, sysBy, loc: pre.loc, at: pre.at,
                        illegal: illegal === undefined ? undefined : illegal ? 1 : 0, once: once === undefined ? undefined : once ? 1 : 0, share: share === undefined ? undefined : share ? 1 : 0, shareDef: shareParam === undefined && share !== undefined ? 1 : undefined,
                        players: players !== undefined && players !== 1 ? players : undefined, cd: intern(cooldowns, cooldownIndex, cd), min, max,
                        rep, pay, buyIn: contract.contractResults?.contractBuyInAmount > 0 ? contract.contractResults.contractBuyInAmount : undefined, refund,
                        time: time > 0 ? round(time, 1) : undefined, diff, limit: deadline?.missionCompletionTime > 0 ? round(deadline.missionCompletionTime, 1) : undefined,
                        pp: usePartial(tmpl?.partialRewardPayout), haul, combat, sites: site.sites,
                        pre: prune({ done: dedupe(pre.done), rep: dedupe(pre.rep), crime: pre.crime }), gives, ev: events, pts: points, bp, items: itemRewards, itemsW: weighted, rental, res,
                        odd, v: variants.map((v) => v.out),
                    });
                    // Hash only game-side values (English text keys, ids, numbers) so a Korean patch update is not a "change".
                    const hashed = [contract.debugName, src, title?.en, titled?.alt.map((v) => v.en), descKey, description?.en, described?.alt.map((v) => v.en), res, type, tmplId, by, scope, sys, pre, illegal, once, share, players, cd, min, max, rep, pay, out.buyIn, time, diff, out.limit,
                        haul, combat !== undefined && combatHash(combats[combat]),
                        siteHash(site.sites), gives, events, points, bp, itemRewards, weighted, rental, variants.map((v) => v.hashed)];
                    rows.push({ out, hashed });
                }
            }
        }
    }

    /** Old-style mission: ContractLegacy.missionBrokerEntry -> MissionBrokerEntry. */
    function legacyRow(contract, events) {
        const brokerRecord = brokers.get(short(contract.missionBrokerEntry)); if (!brokerRecord) { flag('legacyBrokerMissing'); return null; }
        const b = df.readRecord(brokerRecord, 24);
        if (b.notForRelease) return null;   // MissionBrokerEntry.notForRelease
        const props = mergeProps(b.properties);
        const tokens = tokenTexts(props);
        const titled = filledText(b.title, tokens, { title: true }); const described = filledText(b.description, tokens);
        const title = titled?.main; const description = described?.main;   // MissionBrokerEntry.title / .description
        const contractor = names(b.missionGiver);                                              // MissionBrokerEntry.missionGiver
        const type = useType(b.type);                                                          // MissionBrokerEntry.type
        // MissionBrokerEntry.missionResultReputationRewards[slot].reputationAmounts[]
        const rep = (b.missionResultReputationRewards || []).flatMap((list, slot) => (list?.reputationAmounts || []).map((amounts) => repEntry(amounts, RESULT_SLOTS.map((_, i) => i === slot))).filter(Boolean));
        // MissionBrokerEntry.reputationRequirements.expression[] SReputationMissionGiverRequirementParams { factionReputation, reputationScope, comparison, standing }
        const requirements = (b.reputationRequirements?.expression || []).filter((node) => node?.__type === 'SReputationMissionGiverRequirementParams');
        const combinators = (b.reputationRequirements?.expression || []).filter((node) => node && node.__type !== 'SReputationMissionGiverRequirementParams' && !/_And$|Parenthesis$/.test(node.__type));
        if (combinators.length) flag('legacyRequirementNotPlainAnd');
        const paid = rep.find((r) => r.n > 0 && !r.on);
        const main = requirements[0];
        const by = paid?.f || (main && useFaction(main.factionReputation)); const scope = paid?.s || (main && useScope(main.reputationScope));
        let min; let max; const extra = [];
        for (const node of requirements) {
            const f = useFaction(node.factionReputation); const s = useScope(node.reputationScope); const rank = rankOf(s, node.standing);
            if (f === by && s === scope && node.comparison === 'GreaterThanOrEqualTo' && min === undefined) min = rank;
            else if (f === by && s === scope && node.comparison === 'LessThanOrEqualTo' && max === undefined) max = rank;
            else if (f === by && s === scope && node.comparison === 'EqualTo' && min === undefined) { min = rank; max = rank; }
            else extra.push(prune({ f, s, cmp: node.comparison, rank }));
        }
        const site = buildSites(props, new Map()); const combat = buildCombat(props);
        // Cargo: MissionBrokerEntry.missionFlow ... HaulingOrder_Resource { resource, minSCU, maxSCU, maxContainerSize, pickUpLocation, dropOffLocation }
        const haul = buildHaul(props, b.missionFlow);
        if (haul) Object.assign(haul, prune({ pickups: site.pickups || undefined, dropoffs: site.dropoffs || undefined }));
        // MissionBrokerEntry.localityAvailable / .locationMissionAvailable
        const loc = [useLocality(b.localityAvailable)].filter(Boolean); const at = [usePlace(b.locationMissionAvailable)].filter(Boolean);
        let sys = [...new Set([...loc.flatMap((id) => localities[id].sys || []), ...at.map((id) => places[id].sys).filter(Boolean)])]; let sysBy;
        if (!sys.length && site.systems.length) { sys = site.systems; sysBy = 'sites'; }
        sys.sort();
        // MissionBrokerEntry.missionReward (MissionReward { reward, max, currencyType })
        const pay = b.missionReward?.reward > 0 ? prune({ a: b.missionReward.reward, max: b.missionReward.max > 0 ? b.missionReward.max : undefined, cur: b.missionReward.currencyType }) : 'none';
        // MissionBrokerEntry.{hasPersonalCooldown, personalCooldownTime, abandonedCooldownTime, canReacceptAfterAbandoning, canReacceptAfterFailing}
        const cd = prune({ on: b.hasPersonalCooldown ? 1 : undefined, p: b.hasPersonalCooldown ? round(b.personalCooldownTime) : undefined, pv: b.hasPersonalCooldown && b.personalCooldownTimeVariation ? round(b.personalCooldownTimeVariation) : undefined,
            a: round(b.abandonedCooldownTime), av: b.abandonedCooldownTimeVariation ? round(b.abandonedCooldownTimeVariation) : undefined, ra: b.canReacceptAfterAbandoning ? 1 : 0, rf: b.canReacceptAfterFailing ? 1 : 0 });
        // MissionBrokerEntry.requiredCompletedMissionTags[] (TagSearchTerm) / .completionTags / .reputationPrerequisites.wantedLevel
        const done = (b.requiredCompletedMissionTags || []).map((term) => prune({ need: (term.positiveTags || []).map(tagLabel).filter(Boolean), not: (term.negativeTags || []).map(tagLabel).filter(Boolean) })).filter((entry) => Object.keys(entry).length);
        const wanted = b.reputationPrerequisites?.wantedLevel;
        const gives = (b.completionTags?.tags || []).map(tagLabel).filter(Boolean);
        const needs = (b.requiredMissions || []).map(short).filter(Boolean);
        const time = contract.contractResults?.timeToComplete;
        const out = prune({
            id: contract.id, n: contract.debugName, src: 'legacy', t: useText(title), tAlt: titled?.alt.map(useText), d: useText(description), dAlt: described?.alt.map(useText), dRaw: placeholderOnly(description) ? 1 : undefined, type, by,
            // bySrc: 'rep' = faction of the reputation this mission pays ; 'req' = faction of its first reputation requirement
            bySrc: by ? (paid ? 'rep' : 'req') : undefined, con: useText(contractor), scope,
            sys, sysBy, loc, at, illegal: b.lawfulMission ? 0 : 1, once: b.onceOnly ? 1 : 0, share: b.canBeShared ? 1 : 0, players: b.maxPlayersPerInstance !== 1 ? b.maxPlayersPerInstance : undefined, cd: intern(cooldowns, cooldownIndex, cd), min, max,
            rep, pay, buyIn: b.missionBuyInAmount > 0 ? b.missionBuyInAmount : undefined, time: time > 0 ? round(time, 1) : undefined,
            limit: b.missionDeadline?.missionCompletionTime > 0 ? round(b.missionDeadline.missionCompletionTime, 1) : undefined, pp: usePartial(b.partialRewardPayout),
            haul, combat, sites: site.sites,
            pre: prune({ done, rep: extra, crime: wanted && (wanted.minValue || wanted.maxValue) ? [round(wanted.minValue), round(wanted.maxValue)] : undefined, missions: needs }), gives, ev: events,
        });
        const hashed = [contract.debugName, 'legacy', title?.en, titled?.alt.map((v) => v.en), b.description, description?.en, described?.alt.map((v) => v.en), type, by, scope, sys, loc, at, out.illegal, out.once, out.share, cd, min, max, rep, pay, out.buyIn, out.limit, haul, siteHash(site.sites), combat !== undefined && combatHash(combats[combat]), out.pre, gives, events];
        return { out, hashed };
    }

    // ---- order, ids, snapshot ---------------------------------------------------------------
    rows.sort((a, b) => (a.out.by || '~').localeCompare(b.out.by || '~') || (a.out.min ?? 99) - (b.out.min ?? 99) || (a.out.n || '').localeCompare(b.out.n || '') || a.out.id.localeCompare(b.out.id));
    const seenIds = new Set();
    for (const row of rows) { if (seenIds.has(row.out.id) || /^0{8}-/.test(row.out.id)) flag('duplicateOrZeroId'); seenIds.add(row.out.id); }
    const contracts = rows.map((row) => row.out);
    // snapshot[i] is the content hash of contracts[i] (same order) for patch-to-patch comparison by id.
    const snapshot = rows.map((row) => createHash('sha1').update(JSON.stringify(row.hashed)).digest('hex').slice(0, 10));

    // ---- reference tables used only by the calculators --------------------------------------
    // ContractDifficultyProfile { mechanicalSkillWeight, mentalLoadWeight, riskOfLossWeight, gameKnowledgeWeight }
    const profiles = {};
    for (const profile of df.recordsOfType('ContractDifficultyProfile')) { const p = df.readRecord(profile, 1); profiles[idOf(profile)] = [round(p.mechanicalSkillWeight), round(p.mentalLoadWeight), round(p.riskOfLossWeight), round(p.gameKnowledgeWeight)]; }
    // SReputationMissionRewardBonusParams.missionGiverBonuses[] { factionReputation, reputationScope, rewardBonuses[] { standing, bonusFraction } }
    const rankPayBonus = df.recordsOfType('SReputationMissionRewardBonusParams').flatMap((r) => (df.readRecord(r, 4).missionGiverBonuses || []).map((bonus) => {
        const s = useScope(bonus.reputationScope);
        return prune({ f: useFaction(bonus.factionReputation), s, ranks: (bonus.rewardBonuses || []).map((entry) => [rankOf(s, entry.standing), round(entry.bonusFraction)]).filter(([rank]) => rank !== undefined) });
    }));
    // SReputationRewardAmount whose record name carries a different number than its reputationAmount
    const oddAmounts = df.recordsOfType('SReputationRewardAmount').map((r) => { const named = /_(\d+)$/.exec(idOf(r)); const value = df.readRecord(r, 1).reputationAmount; return named && Number(named[1]) !== Math.abs(value) ? [idOf(r), value] : null; }).filter(Boolean);

    // ---- statistics (also asserted by tests) ------------------------------------------------
    const count = (test) => contracts.filter(test).length;
    const withSites = contracts.filter((c) => c.sites);
    const allNamed = (c) => c.sites.every((s) => s.at);
    const rawNames = (table) => Object.values(table).filter((row) => row && (row.raw || row.name?.raw)).length;
    Object.assign(stats, {
        contracts: contracts.length, newStyle: count((c) => c.src !== 'legacy'), legacy: count((c) => c.src === 'legacy'), variants: variantCount,
        bySource: contracts.reduce((acc, c) => { acc[c.src] = (acc[c.src] || 0) + 1; return acc; }, {}),
        payCalculated: count((c) => c.pay === 'calc'), payFixed: count((c) => typeof c.pay === 'object'), payNone: count((c) => c.pay === 'none'),
        titled: count((c) => c.t !== undefined), titledKo: count((c) => c.t !== undefined && texts[c.t].length > 1), described: count((c) => c.d !== undefined),
        describedKo: count((c) => c.d !== undefined && texts[c.d].length > 1),
        // dRaw = the briefing is only a placeholder the files do not fix (not a real description)
        descPlaceholderOnly: count((c) => c.dRaw), titleVariants: count((c) => c.tAlt), descVariants: count((c) => c.dAlt),
        // results whose missionResults are all false (kept in res / rep[].on = [], never shown as rewards)
        resultNoSlot: count((c) => (c.odd || []).includes('resultNoSlot')),
        sysFromSites: count((c) => c.sysBy === 'sites'), sysMixed: count((c) => c.sysBy === 'mixed'), illegalUnknown: count((c) => c.illegal === undefined),
        // table rows that show a record id because the files give no display name ({ en: id, raw: 1 })
        rawNames: { items: rawNames(items), blueprints: rawNames(blueprints), resources: rawNames(resources), factions: rawNames(factions), types: rawNames(types), scopes: rawNames(scopes),
            ranks: Object.values(scopes).reduce((sum, scope) => sum + scope.ranks.filter((rank) => rank.name.raw).length, 0),
            locationsUnnamed: locations.filter((location) => !location.name).length, placesUnnamed: Object.values(places).filter((place) => !place.name).length },
        withSystem: count((c) => c.sys), withFaction: count((c) => c.by), withRep: count((c) => c.rep), withBlueprints: count((c) => c.bp), withItems: count((c) => c.items || c.itemsW),
        withCargo: count((c) => c.haul), withCombat: count((c) => c.combat !== undefined), illegal: count((c) => c.illegal), onceOnly: count((c) => c.once),
        shareExplicit: count((c) => c.share !== undefined && !c.shareDef), shareFromTemplate: count((c) => c.shareDef), shareUnknown: count((c) => c.share === undefined), eventOnly: count((c) => c.ev),
        // Tag -> location resolver: share of contracts whose mission sites can be named
        siteResolver: { locationTemplates: allLocations.length, contractsWithSiteSearch: withSites.length, everySiteNamed: withSites.filter(allNamed).length,
            someSiteNamed: withSites.filter((c) => c.sites.some((s) => s.at)).length, everySiteSingle: withSites.filter((c) => c.sites.every((s) => s.n === 1)).length,
            someSiteUnresolved: withSites.filter((c) => c.sites.some((s) => !s.n)).length, noSiteResolved: withSites.filter((c) => c.sites.every((s) => !s.n)).length, namedLocations: locations.length },
    });

    const sortKeys = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
    const out = {
        version: `${String(build.Branch || '').replace(/^sc-alpha-/, '')}.${build.RequestedP4ChangeNum || ''}`, gameVersion: build.Version, builtAt: new Date().toISOString(),
        source: 'game-files', sourceHash: createHash('sha256').update(df.buffer).digest('hex'),
        note: '모든 값은 게임 파일 그대로이며 서버 설정으로 달라질 수 있음. pay="calc"는 게임 파일에 금액이 없는 계산형 보상(금액 추정 금지). 빈 필드는 0이 아니라 "파일에 없음".',
        // Units. cooldown: values 2880 (= 48 h) and 10080 (= 7 d) only make sense as minutes; the others share the same
        // param family / magnitude but no field names the unit, so they stay "assumed".
        units: { cd: 'minutes (round values 2880 = 48 h and 10080 = 7 d in ContractIntParam PersonalCooldownTime; not timed in game)', time: 'minutes (assumed from magnitude; ContractResults.timeToComplete has no unit in the file)',
            limit: 'unit not stated in file (MissionDeadline.missionCompletionTime)', rental: 'minutes (field name durationMinutes)' },
        resultSlots: RESULT_SLOTS,
        // Things this file states that the game files do not state outright. Screens should word them accordingly.
        assumptions: {
            resultSlots: 'missionResults is a plain Boolean[5] with no index names in the file; mapping index -> EMissionResult option order (Completed first) is inferred, not stated.',
            sys: 'sys = star system(s) where the contract is OFFERED (Locality / Location prerequisites), not where it takes place; interstellar hauls list only the offering system. sysBy "sites" / "mixed" = taken (partly) from mission-site search tags instead.',
            cd: 'cooldown unit "minutes" rests only on the values 2880 and 10080 of PersonalCooldownTime; not timed in game.',
            textVariants: 't / d use the first MissionOrganization string variant in file order; tAlt / dAlt list the others. The file has no weights; which one the game shows is not known.',
            box: 'box -1 is the stored maxContainerSize; read as "no size limit set", not verified in game.',
            poolNull: 'a pool entry [null, weight] is a blueprintRewards entry whose blueprint reference is empty in the file; whether it dilutes the drop chance is not known.',
        },
        payout: { calc: 'not in game data', reason: 'ContractResult_CalculatedReward has no amount field. No base-rate table or formula exists in Game2.dcb (struct and field names searched) or in the text/config files of Data.p4k (content searched: 14,407 files with extensions xml json cfg ini txt eco opr dat set dpl lut csv lua; an independent second pass over 13,824 files with a shorter extension list also found nothing).',
            inputs: 'time (ContractResults.timeToComplete), diff = [ContractDifficultyProfile, mechanicalSkill, mentalLoad, riskOfLoss, gameKnowledge] levels 1-8, difficultyProfiles weights in the same order',
            fixed: 'pay = {a, max?, cur} from ContractResult_Reward.contractReward or MissionBrokerEntry.missionReward', none: 'pay = "none": the contract has no currency result at all' },
        difficultyProfiles: sortKeys(profiles),
        difficultyLevels: { mechanicalSkill: enumOptions('EDifficultyRange_MechanicalSkill'), mentalLoad: enumOptions('EDifficultyRange_MentalLoad'), riskOfLoss: enumOptions('EDifficultyRange_RiskOfLoss'), gameKnowledge: enumOptions('EDifficultyRange_GameKnowledge') },
        rankPayBonus, oddAmounts, stats,
        types: sortKeys(types), factions: sortKeys(factions), scopes: sortKeys(scopes), localities: sortKeys(localities), places: sortKeys(places), locations,
        resources: sortKeys(resources), items: sortKeys(items), haulSets: sortKeys(haulSets), pools: sortKeys(pools), blueprints: sortKeys(blueprints), scenarios: sortKeys(scenarios),
        partials, cooldowns, tagSets, spawnGroups, combats, texts, contracts, snapshot,
    };

    const json = `${JSON.stringify(out)}\n`;
    const summary = `임무 ${contracts.length}건 (새 방식 ${stats.newStyle}, 옛 방식 ${stats.legacy}, 변형 ${variantCount}), 문구 ${texts.length}개, ${Math.round(json.length / 1024)}KB`;
    if (CHECK) {
        const strip = (text) => { const data = JSON.parse(text); delete data.builtAt; return JSON.stringify(data); };
        const same = existsSync(OUT_PATH) && strip(readFileSync(OUT_PATH, 'utf8')) === strip(json);
        console.log(same ? `변경 없음: ${summary}` : 'data/contracts/missions.json 이 게임 파일과 다릅니다. --check 없이 다시 만드세요.');
        process.exit(same ? 0 : 1);
    }
    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, json);
    writeFileSync(resolve(dirname(OUT_PATH), 'mission-list.json'), missionOverview(out));
    console.log(summary);
    if (process.argv.includes('--stats')) console.log(JSON.stringify(stats, null, 1));
}
