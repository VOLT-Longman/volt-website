#!/usr/bin/env node
/**
 * 제작 설계도 전체 자료 — 설치된 게임 파일의 제작 설계도(CraftingBlueprintRecord)를 모두 뽑는다.
 *
 * 입력(--cache-dir): Game2.dcb, global.ini(영어), build.json.  선택: --ko-ini <한국어 패치 global.ini>
 *   또한 data/mining/helper.json 을 읽어 재료를 채광 자료의 광물 id와 잇는다(같은 게임 빌드여야 한다).
 * 출력: data/crafting/blueprints.json
 * 사용: node scripts/crafting/build-blueprints-data.mjs --cache-dir <폴더> [--ko-ini <경로>] [--check]
 *   --check 는 아무것도 쓰지 않고, 만들어질 내용이 기존 파일과 다르면 종료 코드 1로 끝난다(builtAt 은 비교하지 않는다).
 *
 * 외부 서비스에 접근하지 않는다. 값은 게임 파일 그대로이며 게임 안에서 확인한 값이 아니다.
 * 게임 파일에 없는 값은 0으로 채우지 않고 항목 자체를 뺀다. 뜻을 확인하지 못한 값은 unknowns 에 적는다.
 *
 * Every emitted field names its source record type and field in a comment next to the code that reads it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { DataForge } from '../gamedata/dataforge.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_FILE = resolve(ROOT, 'data/crafting/blueprints.json');

const short = (ref) => (ref?.name ? String(ref.name).split('.').slice(1).join('.') : undefined);
const idOf = (record) => record.name.split('.').slice(1).join('.');
// Game numbers are 32-bit floats; 6 decimals removes the float noise (0.800000011920929 -> 0.8) without changing a value.
export const num = (value) => Number(Number(value).toFixed(6));
const prune = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)));

/** Interning table: the same value gets the same index, in first-seen order. */
export function table() {
    const index = new Map(); const list = [];
    return { list, add(key, make) { if (!index.has(key)) { index.set(key, list.length); list.push(make()); } return index.get(key); } };
}

/** TimeValue_Partitioned {days, hours, minutes, seconds} -> seconds. */
export const partitionedSeconds = (time) => (time ? (time.days || 0) * 86400 + (time.hours || 0) * 3600 + (time.minutes || 0) * 60 + (time.seconds || 0) : undefined);

/**
 * One stat modifier of a cost node.
 * Source: CraftingCostContext_ResultGameplayPropertyModifiers.gameplayPropertyModifiers (CraftingGameplayPropertyModifiers_List)
 *   .gameplayPropertyModifiers[] = CraftingGameplayPropertyModifierCommon { gameplayPropertyRecord, valueRanges[] }.
 * valueRanges[] is CraftingGameplayPropertyModifierValueRange_Linear { startQuality, endQuality, modifierAtStart, modifierAtEnd }
 *   or ..._LinearIntegerAdditive { startQuality, endQuality, additiveModifierAtStart, additiveModifierAtEnd } (`add`: 1).
 * The values are kept as written. How the game applies a _Linear value to the base stat is not stated in the files (see unknowns.modifierApply).
 * A null entry in valueRanges is a null pointer in the game file: the stat is named but no range is given, so `r` is left out.
 */
export function modifierOf(modifier, statIndex) {
    if (modifier?.__type !== 'CraftingGameplayPropertyModifierCommon') throw new Error(`Unknown stat modifier type ${modifier?.__type}`);
    const ranges = (modifier.valueRanges || []).filter(Boolean);
    const kinds = new Set(ranges.map((range) => range.__type));
    if (kinds.size > 1) throw new Error(`Mixed value range types in one modifier: ${[...kinds].join(', ')}`);
    const kind = [...kinds][0];
    let additive = false; let rows;
    if (kind === 'CraftingGameplayPropertyModifierValueRange_Linear') rows = ranges.map((range) => [range.startQuality, range.endQuality, num(range.modifierAtStart), num(range.modifierAtEnd)]);
    else if (kind === 'CraftingGameplayPropertyModifierValueRange_LinearIntegerAdditive') { additive = true; rows = ranges.map((range) => [range.startQuality, range.endQuality, range.additiveModifierAtStart, range.additiveModifierAtEnd]); }
    else if (kind) throw new Error(`Unknown value range type ${kind}`);
    return prune({ s: statIndex(short(modifier.gameplayPropertyRecord)), add: additive ? 1 : undefined, r: rows, partial: rows && ranges.length !== modifier.valueRanges.length ? 1 : undefined });
}

/**
 * Context entries of a cost node (CraftingCost_*.context[]). Returns only what the file states:
 *   f   = stat modifier indexes (CraftingCostContext_ResultGameplayPropertyModifiers)
 *   inc = CraftingCostContext_ResultCompositionInclusion.option as written: 1 for "Include", 0 for "Exclude"
 *   x   = CraftingCostContext_QuantityMultiplier.multiplier (kept apart from the amount; it is NOT applied to scu / pc)
 * Null context entries are null pointers in the file and carry nothing.
 */
export function contextOf(node, h) {
    const out = {};
    for (const entry of node.context || []) {
        if (!entry) continue;
        if (entry.__type === 'CraftingCostContext_ResultGameplayPropertyModifiers') {
            const list = entry.gameplayPropertyModifiers;
            if (list?.__type !== 'CraftingGameplayPropertyModifiers_List') throw new Error(`Unknown modifier list type ${list?.__type}`);
            out.f = [...(out.f || []), ...list.gameplayPropertyModifiers.map((modifier) => h.modifier(modifier))];
        } else if (entry.__type === 'CraftingCostContext_ResultCompositionInclusion') {
            if (entry.option !== 'Include' && entry.option !== 'Exclude') throw new Error(`Unknown composition inclusion option ${entry.option}`);
            out.inc = entry.option === 'Include' ? 1 : 0;
        } else if (entry.__type === 'CraftingCostContext_QuantityMultiplier') out.x = num(entry.multiplier);
        else throw new Error(`Unknown cost context type ${entry.__type}`);
    }
    return out;
}

/**
 * One material choice inside a slot.
 *   CraftingCost_Resource { resource -> ResourceType, quantity (SStandardCargoUnit.standardCargoUnits | SMicroCargoUnit.microSCU), minQuality } -> { mat, scu, q }
 *   CraftingCost_Item     { entityClass -> EntityClassDefinition, quantity (whole pieces), minQuality }                                   -> { mat, pc, q }
 * SCU and pieces are different units and are never converted into each other.
 */
export function optionOf(node, h) {
    if (node?.__type === 'CraftingCost_Resource') {
        const quantity = node.quantity || {};
        const scu = Number.isFinite(quantity.standardCargoUnits) ? quantity.standardCargoUnits : Number.isFinite(quantity.microSCU) ? quantity.microSCU / 1e6 : undefined;
        if (scu === undefined) throw new Error(`Resource cost without a readable quantity (${short(node.resource)})`);
        return { mat: h.resource(short(node.resource)), scu: num(scu), q: node.minQuality, ...contextOf(node, h) };
    }
    if (node?.__type === 'CraftingCost_Item') {
        if (!Number.isFinite(node.quantity)) throw new Error(`Item cost without a readable quantity (${short(node.entityClass)})`);
        return { mat: h.item(short(node.entityClass)), pc: node.quantity, q: node.minQuality, ...contextOf(node, h) };
    }
    throw new Error(`Unknown cost option type ${node?.__type}`);
}

/**
 * Recipe of one tier. Source: CraftingBlueprintTier.recipe (CraftingRecipe).costs (CraftingRecipeCosts) { craftTime, mandatoryCost, optionalCosts[] }.
 * mandatoryCost is a CraftingCost_Select { count, options[] } whose options are the named slots, each again a
 * CraftingCost_Select { nameInfo, count, options[] } holding the material choices.
 *   pick (recipe) = mandatoryCost.count, written only when it is smaller than the number of slots: the player fills `pick` of the listed slots.
 *   pick (slot)   = slot count, written only when it is smaller than the number of options: the options are alternatives.
 * Alternatives stay separate entries. Nothing here adds amounts together.
 */
export function recipeOf(costs, h) {
    const root = costs?.mandatoryCost;
    if (root?.__type !== 'CraftingCost_Select') throw new Error(`Recipe root is ${root?.__type}, expected CraftingCost_Select`);
    if ((costs.optionalCosts || []).length) throw new Error('optionalCosts is not empty: the builder does not model optional costs yet');
    const slots = root.options.map((slot) => {
        if (slot?.__type !== 'CraftingCost_Select') throw new Error(`Slot is ${slot?.__type}, expected CraftingCost_Select`);
        return prune({ n: h.slot(slot.nameInfo), pick: slot.count !== slot.options.length ? slot.count : undefined, o: slot.options.map((option) => optionOf(option, h)), ...contextOf(slot, h) });
    });
    return prune({ s: partitionedSeconds(costs.craftTime), pick: root.count !== root.options.length ? root.count : undefined, ...contextOf(root, h), slots });
}

/** Our own grouping of BlueprintCategoryRecord names (the records carry no fields or display text). */
export function categoryKind(category) {
    if (/^FPSArmours$/.test(category)) return 'armor';
    if (/^FPSWeapons$/.test(category)) return 'fpsWeapon';
    if (/^VehicleComponentS\d+$/.test(category)) return 'shipComponent';
    if (/^VehicleWeaponsS\d+$/.test(category)) return 'shipWeapon';
    if (/^MissionItem$/.test(category)) return 'missionItem';
    return 'other';
}

/** "%.2f M" -> "M", "%+.2f %%" -> "%": the unit text of a game number format, without the number placeholder. */
export const unitText = (format) => (format ? format.replace(/%[+-]?[\d.]*[fd]/g, '').replace(/%%/g, '%').trim() || undefined : undefined);

/**
 * Number part of a game format string: "%+.2f %%" -> { sign: 1, dp: 2 }, "%.2f M" -> { dp: 2 }, "Rating" -> {}.
 *   sign = the format shows a leading + on positive numbers; dp = decimals shown.
 */
export function numberFormat(format) {
    const match = /%([+-]?)(?:\d*\.(\d+))?[fd]/.exec(format || '');
    if (!match) return {};
    return prune({ sign: match[1] === '+' ? 1 : undefined, dp: match[2] !== undefined ? Number(match[2]) : undefined });
}

/**
 * Required rows of a trade, in template order.
 * Source: ContractTemplate.objectiveTokens[].objectiveHandler (ObjectiveHandler_Hauling).haulingOrders[].
 *   HaulingOrder_EntityClass / HaulingOrder_Resource are fixed rows of the template.
 *   HaulingOrder_Property is a placeholder: haulingOrdersProperty.missionVariableName names a mission variable. It is filled by the contract's
 *     paramOverrides.propertyOverrides[] entry with the same missionVariableName (MissionPropertyValue_HaulingOrders.haulingOrderContent[]),
 *     or, when the contract has no such entry, by the placeholder's own default haulingOrdersProperty.property.value.haulingOrderContent[].
 * A contract override whose variable no placeholder of the template names is NOT added (the template never reads it); its variable name is
 * returned in `unused` so the trade can be marked.
 */
export function tradeNeed(templateData, contract, needOf) {
    const overrides = new Map();
    for (const property of contract?.paramOverrides?.propertyOverrides || []) {
        if (property?.value?.__type !== 'MissionPropertyValue_HaulingOrders') continue;
        if (overrides.has(property.missionVariableName)) throw new Error(`Two hauling overrides for mission variable ${property.missionVariableName}`);
        overrides.set(property.missionVariableName, property.value.haulingOrderContent || []);
    }
    const need = []; const used = new Set();
    for (const token of templateData?.objectiveTokens || []) {
        for (const order of token.objectiveHandler?.haulingOrders || []) {
            if (order.__type !== 'HaulingOrder_Property') { need.push(needOf(order)); continue; }
            const variable = order.haulingOrdersProperty?.missionVariableName;
            if (!variable) throw new Error('HaulingOrder_Property without a mission variable name');
            used.add(variable);
            const content = overrides.has(variable) ? overrides.get(variable) : order.haulingOrdersProperty.property?.value?.haulingOrderContent || [];
            for (const entry of content) need.push(needOf(entry));
        }
    }
    return { need, unused: [...overrides.keys()].filter((variable) => !used.has(variable)) };
}

function build({ cacheDir, koIni }) {
    const df = new DataForge(readFileSync(resolve(cacheDir, 'Game2.dcb')));
    if (!df.consistent) throw new Error('Game2.dcb did not parse to its end; refusing to build from a partial read.');
    const buildInfo = JSON.parse(readFileSync(resolve(cacheDir, 'build.json'), 'utf8'));
    const loadIni = (path) => {
        const map = new Map();
        for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) { const at = line.indexOf('='); if (at > 0) map.set(line.slice(0, at).replace(/^﻿/, '').replace(/,P$/i, '').trim().toLowerCase(), line.slice(at + 1).trim()); }
        return map;
    };
    const en = loadIni(resolve(cacheDir, 'global.ini'));
    const ko = koIni && existsSync(koIni) ? loadIni(koIni) : null;
    const lookup = (map, key) => { if (!map || !key || !String(key).startsWith('@')) return undefined; const value = map.get(String(key).slice(1).toLowerCase()); return value && !/LOC_|PLACEHOLDER/.test(value) ? value.replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').trim() || undefined : undefined; };
    const names = (key) => { const english = lookup(en, key); if (!english) return undefined; const korean = lookup(ko, key); return korean && korean !== english ? { en: english, ko: korean } : { en: english }; };
    const component = (entity, type) => (entity?.Components || []).find((c) => c && c.__type === type);

    const mining = JSON.parse(readFileSync(resolve(ROOT, 'data/mining/helper.json'), 'utf8'));
    if (mining.gameVersion !== buildInfo.Version) throw new Error('Mining and blueprint game builds must match. Rebuild mining data first.');
    // mining.json mineral id for a material: the mineral itself (hand / vehicle mining) or the mineral whose refined.id is the material.
    const mineralOf = new Map();
    for (const mineral of mining.minerals) { mineralOf.set(mineral.id, mineral.id); if (mineral.refined?.id) mineralOf.set(mineral.refined.id, mineral.id); }

    const resourceRecords = new Map(df.recordsOfType('ResourceType').map((record) => [idOf(record), record]));
    const entityRecords = new Map(df.recordsOfType('EntityClassDefinition').map((record) => [idOf(record).toLowerCase(), record]));
    const entityCache = new Map();
    const entity = (cls) => { const key = String(cls).toLowerCase(); if (!entityCache.has(key)) { const record = entityRecords.get(key); entityCache.set(key, record ? df.readRecord(record, 6) : null); } return entityCache.get(key); };
    // Display name key of an item: SAttachableComponentParams.AttachDef.Localization.Name; vehicles: VehicleComponentParams.vehicleName.
    const entityNames = (cls) => { const data = entity(cls); return names(component(data, 'SAttachableComponentParams')?.AttachDef?.Localization?.Name) || names(component(data, 'VehicleComponentParams')?.vehicleName); };

    // ---- global crafting parameters -------------------------------------------------
    const globalRecords = df.recordsOfType('CraftingGlobalParams');
    if (globalRecords.length !== 1) throw new Error(`Expected one CraftingGlobalParams record, found ${globalRecords.length}`);
    const globals = df.readRecord(globalRecords[0], 4);
    // Default-owned blueprints: CraftingGlobalParams.defaultBlueprintSelection (DefaultBlueprintSelection_Whitelist).blueprintRecords[].
    if (globals.defaultBlueprintSelection?.__type !== 'DefaultBlueprintSelection_Whitelist') throw new Error(`Unknown default blueprint selection ${globals.defaultBlueprintSelection?.__type}`);
    const defaultOwned = new Set(globals.defaultBlueprintSelection.blueprintRecords.map(short));
    // Materials that dismantling does not give back: CraftingGlobalParams.dismantleBlacklistResources[] / dismantleBlacklistEntityClasses[].
    const noReturnResources = (globals.dismantleBlacklistResources || []).map(short);
    const noReturnItems = (globals.dismantleBlacklistEntityClasses || []).map(short);

    // ---- lookup tables ----------------------------------------------------------------
    const materials = table(); const slotNames = table(); const stats = table(); const mods = table();
    const categories = table(); const itemTypes = table(); const makers = table(); const recipes = table();
    // Colour variants share one recipe, so recipes are stored once and blueprints point at them.
    const recipeIndex = (recipe) => recipes.add(JSON.stringify(recipe), () => recipe);
    const makerRecords = new Map(df.recordsOfType('SCItemManufacturer').map((record) => [idOf(record), record]));
    const statRecords = new Map(df.recordsOfType('CraftingGameplayPropertyDef').map((record) => [idOf(record), record]));
    const transformOf = (node) => {
        if (!node) return [];
        const kind = node.__type.replace('CraftingDisplayTransformation_', '');
        if (kind === 'Sequence') return node.transformations.flatMap(transformOf);
        return [Number.isFinite(node.scale) ? [kind, Number(node.scale.toPrecision(6))] : [kind]];
    };
    // Stat definition: CraftingGameplayPropertyDef { propertyName, unitFormat, displayTransformation, nameOverrides[] { propertyName, condition.matchItemTypes[] } }.
    const statIndex = (id) => stats.add(id, () => {
        const record = statRecords.get(id); if (!record) throw new Error(`Stat definition ${id} not found`);
        const data = df.readRecord(record, 6);
        const alt = (data.nameOverrides || []).map((override) => prune({ name: names(override.propertyName), types: override.condition?.matchItemTypes, subTypes: override.condition?.matchSubTypes }));
        // unit / sign / dp: CraftingGameplayPropertyDef.unitFormat -> text key -> game format string such as "%+.2f %%" (English file and Korean patch).
        const format = lookup(en, data.unitFormat); const unitEn = unitText(format); const unitKo = unitText(lookup(ko, data.unitFormat));
        return prune({ id, name: names(data.propertyName), unit: unitEn ? (unitKo && unitKo !== unitEn ? { en: unitEn, ko: unitKo } : { en: unitEn }) : undefined, ...numberFormat(format), show: transformOf(data.displayTransformation), alt });
    });
    const materialEntry = (id, itemClass) => {
        const resource = resourceRecords.get(id);
        // Resource name: ResourceType.displayName. Loose-piece name: the item's own AttachDef.Localization.Name.
        const name = (resource && names(df.readRecord(resource, 1).displayName)) || (itemClass && entityNames(itemClass));
        const noReturn = noReturnResources.includes(id) || (itemClass && noReturnItems.includes(itemClass));
        return prune({ id, name, mine: mineralOf.get(id), item: itemClass, noReturn: noReturn ? 1 : undefined });
    };
    const helpers = {
        resource: (id) => { if (!id) throw new Error('Resource cost without a resource reference'); return materials.add(id, () => materialEntry(id)); },
        // A loose piece is an entity; its commodity is ResourceContainer.defaultComposition[0].entry -> ResourceType (used only when there is exactly one).
        item: (cls) => {
            if (!cls) throw new Error('Item cost without an entity reference');
            const composition = component(entity(cls), 'ResourceContainer')?.defaultComposition || [];
            const id = composition.length === 1 ? short(composition[0].entry) : undefined;
            const index = materials.add(id || cls, () => materialEntry(id || cls, cls));
            const entry = materials.list[index];
            if (!entry.item) { entry.item = cls; if (noReturnItems.includes(cls)) entry.noReturn = 1; } else if (entry.item !== cls) throw new Error(`Two different piece items share material ${entry.id}: ${entry.item}, ${cls}`);
            return index;
        },
        // Slot name: CraftingCost_Select.nameInfo (CraftingNameInfo) { displayName (text key), debugName }. debugName is used only when the key has no text.
        slot: (nameInfo) => { const key = String(nameInfo?.displayName || '').toLowerCase(); const text = names(nameInfo?.displayName); const debug = String(nameInfo?.debugName || '').replace(/:$/, '').trim(); return slotNames.add(text ? key : `debug:${debug}`, () => (text ? { name: text } : { debug })); },
        modifier: (modifier) => { const value = modifierOf(modifier, statIndex); return mods.add(JSON.stringify(value), () => value); },
    };

    // ---- blueprints -----------------------------------------------------------------------
    const blueprintRecords = df.recordsOfType('CraftingBlueprintRecord').sort((x, y) => idOf(x).localeCompare(idOf(y), 'en', { numeric: true }));
    const blueprints = []; const blueprintIndex = new Map(); let dismantle; const skipped = [];
    for (const record of blueprintRecords) {
        const id = idOf(record);
        const blueprint = df.readRecord(record, 20).blueprint;
        if (blueprint?.__type === 'GenericCraftingBlueprint' && blueprint.processSpecificData?.__type === 'GenericCraftingProcess_Dismantle') {
            // Dismantling: GenericCraftingBlueprint.processSpecificData (GenericCraftingProcess_Dismantle) { efficiency, dismantleTime }.
            dismantle = prune({ id, efficiency: num(blueprint.processSpecificData.efficiency), s: partitionedSeconds(blueprint.processSpecificData.dismantleTime), defaultOwned: defaultOwned.has(id) ? 1 : undefined, noReturn: { resources: noReturnResources, items: noReturnItems } });
            continue;
        }
        if (blueprint?.__type !== 'CraftingBlueprint' || blueprint.processSpecificData?.__type !== 'CraftingProcess_Creation') { skipped.push(`${id}:${blueprint?.__type}/${blueprint?.processSpecificData?.__type}`); continue; }
        // Output item: CraftingBlueprint.processSpecificData (CraftingProcess_Creation).entityClass.
        const output = short(blueprint.processSpecificData.entityClass);
        // A null entityClass is a broken reference in the game file: the blueprint is kept and marked, nothing is guessed from its name.
        const definition = output ? component(entity(output), 'SAttachableComponentParams')?.AttachDef : undefined;
        // Category: CraftingBlueprint.category -> BlueprintCategoryRecord (record name only). kind is our own grouping of those names.
        const category = short(blueprint.category);
        const makerId = short(definition?.Manufacturer);
        const tiers = (blueprint.tiers || []).map((tier) => recipeIndex(recipeOf(tier.recipe?.costs, helpers)));
        if (!tiers.length) throw new Error(`${id} has no tier`);
        blueprintIndex.set(id, blueprints.length);
        blueprints.push(prune({
            id,
            // o is written only when the output class is not simply the id without its "BP_CRAFT_" prefix.
            o: `BP_CRAFT_${output}` === id ? undefined : output,
            noOutput: output ? undefined : 1,
            // u = record GUID of the output EntityClassDefinition, written for personal weapons and armour only: data/gear/*.json lists its variants by this GUID.
            //     Ship items link by class name instead (data/loadout/items.json `cls`), so the GUID is left out there to keep the file small.
            u: output && /^(armor|fpsWeapon)$/.test(categoryKind(category)) ? entityRecords.get(output.toLowerCase())?.id : undefined,
            // Name: output item's SAttachableComponentParams.AttachDef.Localization.Name (CraftingBlueprint.blueprintName is a placeholder in the files).
            name: names(definition?.Localization?.Name),
            c: categories.add(category, () => ({ id: category, kind: categoryKind(category) })),
            // Sub-category, size and grade: output item's AttachDef.Type / SubType, Size, Grade.
            t: definition ? itemTypes.add(`${definition.Type}/${definition.SubType}`, () => prune({ type: definition.Type, sub: definition.SubType === 'UNDEFINED' ? undefined : definition.SubType })) : undefined,
            z: definition?.Size, g: definition?.Grade,
            // Maker: AttachDef.Manufacturer -> SCItemManufacturer { Code, Localization.Name }.
            m: makerId ? makers.add(makerId, () => { const data = df.readRecord(makerRecords.get(makerId), 3); return prune({ id: makerId, name: names(data?.Localization?.Name) }); }) : undefined,
            d: defaultOwned.has(id) ? 1 : undefined,
            // r = recipe of the first tier (CraftingBlueprint.tiers[0]); more = recipes of further tiers, which no blueprint has in the current files.
            r: tiers[0], more: tiers.slice(1),
        }));
    }
    if (!dismantle) throw new Error('GlobalGenericDismantle (GenericCraftingProcess_Dismantle) not found');

    // ---- blueprint pools ---------------------------------------------------------------
    // BlueprintPoolRecord.blueprintRewards[] = BlueprintReward { weight, blueprintRecord -> CraftingBlueprintRecord }. Key = record name of the pool.
    const pools = {}; let poolEntries = 0; let poolMissing = 0;
    for (const record of df.recordsOfType('BlueprintPoolRecord').sort((x, y) => idOf(x).localeCompare(idOf(y), 'en', { numeric: true }))) {
        const data = df.readRecord(record, 3);
        const entries = []; let missing = 0;
        for (const reward of data.blueprintRewards || []) {
            const index = blueprintIndex.get(short(reward.blueprintRecord));
            // A null or non-creation reference is counted, not guessed.
            if (index === undefined) { missing += 1; continue; }
            entries.push([index, num(reward.weight)]);
        }
        poolEntries += entries.length; poolMissing += missing;
        pools[idOf(record)] = prune({ e: entries, missing: missing || undefined });
    }

    // ---- event tier rewards that grant pools ------------------------------------------
    // ScenarioProgress.factionRewardTiers[] { faction, tierProgressions[].tierRewards[] = STierReward { minPoints, blueprintPool[] } }. Only tiers with a pool are kept.
    const eventTiers = [];
    for (const record of df.recordsOfType('ScenarioProgress').sort((x, y) => idOf(x).localeCompare(idOf(y)))) {
        for (const group of df.readRecord(record, 6).factionRewardTiers || []) for (const progression of group.tierProgressions || []) for (const tier of progression.tierRewards || []) {
            const list = (tier.blueprintPool || []).map(short).filter((id) => pools[id]);
            if (list.length) eventTiers.push(prune({ scenario: idOf(record), faction: short(group.faction), minPoints: tier.minPoints, pools: list }));
        }
    }

    // ---- fabricators ---------------------------------------------------------------------
    // Entity with CrafterComponentParams.queues[] = CraftingQueueCoreParams { debugName, blueprintCategoryAvailability (…_Whitelist.categories[]), maxJobsInProgress, maxJobsWaiting }.
    const stations = [];
    const crafterStruct = df.structByName.get('CrafterComponentParams');
    let crafterSeen = 0;
    for (const record of df.recordsOfType('EntityClassDefinition')) {
        if (!/fabricator|craft/i.test(record.name)) continue;
        const data = df.readRecord(record, 7); const crafter = component(data, 'CrafterComponentParams'); if (!crafter) continue;
        crafterSeen += 1;
        const name = entityNames(idOf(record)); if (!name) continue; // the unnamed template bench is not a player-facing machine
        // cats: the file repeats some categories inside one whitelist; each id is written once, in first-seen order. Ids without blueprints are kept.
        const queue = (label) => (crafter.queues || []).filter((q) => q.debugName === label).map((q) => prune({ cats: [...new Set((q.blueprintCategoryAvailability?.categories || []).map(short))], run: q.maxJobsInProgress, wait: q.maxJobsWaiting }))[0];
        stations.push(prune({ id: idOf(record), name, make: queue('Create/Repair/Upgrade/Refine'), dismantle: queue('Dismantle') }));
    }
    if (crafterStruct && crafterSeen !== df.instanceCount[crafterStruct.index]) throw new Error(`Found ${crafterSeen} fabricator entities but the file holds ${df.instanceCount[crafterStruct.index]} CrafterComponentParams`);
    stations.sort((x, y) => x.id.localeCompare(y.id));

    // ---- Wikelo-style trades (bring items, receive items) ---------------------------
    // Contracts whose MissionType record name starts with "WIkelo_" (as spelled in the files), released ones only.
    const tradeItems = table();
    const itemIndex = (cls) => tradeItems.add(cls, () => prune({ id: cls, name: entityNames(cls) }));
    const templates = new Map(df.recordsOfType('ContractTemplate').map((record) => [idOf(record), record]));
    const templateCache = new Map();
    const template = (id) => { if (!templateCache.has(id)) templateCache.set(id, templates.has(id) ? df.readRecord(templates.get(id), 12) : null); return templateCache.get(id); };
    const stringParam = (params, key) => (params?.stringParamOverrides || []).find((entry) => entry.param === key)?.value;
    // Korean patch titles end with patch-author notes such as "[25 평판]" or "[BP]" that are not game text.
    const title = (key) => { const value = names(key); if (value?.ko && !/\]\s*$/.test(value.en)) { value.ko = value.ko.replace(/(\s*\[[^\]]*\])+\s*$/, '').trim(); if (!value.ko || value.ko === value.en) delete value.ko; } return value; };
    const needOf = (order) => {
        // HaulingOrder_EntityClass / HaulingOrderContent_EntityClass { entityClass, minAmount, maxAmount }
        if (/_EntityClass$/.test(order.__type)) return { i: itemIndex(short(order.entityClass)), min: order.minAmount, max: order.maxAmount };
        // HaulingOrder_Resource / HaulingOrderContent_Resource { resource, minSCU, maxSCU, maxContainerSize }
        if (/_Resource$/.test(order.__type)) return prune({ res: short(order.resource), minScu: order.minSCU, maxScu: order.maxSCU, box: order.maxContainerSize > 0 ? order.maxContainerSize : undefined });
        throw new Error(`Unknown hauling order type ${order.__type}`);
    };
    // Access conditions: handler.defaultAvailability (ContractAvailability).prerequisites[] plus contract.additionalPrerequisites[].
    //   ContractPrerequisite_CompletedContractTags { requiredCompletedContractTags.tags[] -> Tag.tagName, requiredCountValue, excludedCompletedContractTags.tags[] } -> tags / tagCount / notTags
    //   ContractPrerequisite_CrimeStat { minCrimeStat, maxCrimeStat }                                                                              -> crime [min, max]
    //   ContractPrerequisite_Reputation { scope -> SReputationScopeParams.scopeName, minStanding / maxStanding -> SReputationStandingParams { displayName, minReputation }, exclude } -> rep
    // Identical condition sets are stored once in tradeAccess; a trade points at its set with `a`.
    const tradeAccess = table();
    const tagNameOf = (ref) => { const tag = ref?.__record && df.recordById.get(ref.__record); if (!tag) throw new Error('Contract prerequisite names a tag that is not in the file'); return df.readRecord(tag, 1).tagName; };
    const standingOf = (ref) => { const standing = ref?.__record && df.recordById.get(ref.__record); if (!standing) return undefined; const data = df.readRecord(standing, 1); return prune({ id: idOf(standing), name: names(data.displayName), rep: data.minReputation }); };
    const accessIndex = (handler, contract) => {
        const access = {};
        for (const rule of [...(handler.defaultAvailability?.prerequisites || []), ...(contract.additionalPrerequisites || [])]) {
            if (!rule) continue;
            if (rule.__type === 'ContractPrerequisite_CompletedContractTags') {
                const tags = (rule.requiredCompletedContractTags?.tags || []).map(tagNameOf);
                access.tags = [...new Set([...(access.tags || []), ...tags])];
                if (rule.requiredCountValue !== tags.length) access.tagCount = rule.requiredCountValue;
                const excluded = (rule.excludedCompletedContractTags?.tags || []).map(tagNameOf);
                if (excluded.length) access.notTags = [...new Set([...(access.notTags || []), ...excluded])];
            } else if (rule.__type === 'ContractPrerequisite_CrimeStat') {
                if (access.crime) throw new Error('Two crime stat prerequisites on one trade');
                access.crime = [rule.minCrimeStat, rule.maxCrimeStat];
            } else if (rule.__type === 'ContractPrerequisite_Reputation') {
                if (access.rep) throw new Error('Two reputation prerequisites on one trade');
                const scopeRecord = rule.scope?.__record && df.recordById.get(rule.scope.__record);
                access.rep = prune({ scope: scopeRecord ? df.readRecord(scopeRecord, 1).scopeName : undefined, min: standingOf(rule.minStanding), max: standingOf(rule.maxStanding), exclude: rule.exclude ? 1 : undefined });
            } else throw new Error(`Unknown contract prerequisite type ${rule.__type}`);
        }
        // Fixed key order, so the same conditions written in a different order in the file become the same set.
        const value = prune({ tags: access.tags, tagCount: access.tagCount, notTags: access.notTags, crime: access.crime, rep: access.rep });
        return Object.keys(value).length ? tradeAccess.add(JSON.stringify(value), () => value) : undefined;
    };
    // A third place that names a blueprint pool: MissionModifier_TemporaryBlueprint { modifierName, enabled, blueprintPool }. Counted against the file's instance count.
    const tempBlueprints = [];
    const collect = (value, type, found = []) => { if (Array.isArray(value)) for (const entry of value) collect(entry, type, found); else if (value && typeof value === 'object') { if (value.__type === type) found.push(value); for (const entry of Object.values(value)) collect(entry, type, found); } return found; };
    const trades = [];
    for (const record of df.recordsOfType('ContractGenerator')) {
        const generator = df.readRecord(record, 14);
        for (const modifier of collect(generator, 'MissionModifier_TemporaryBlueprint')) tempBlueprints.push(prune({ in: idOf(record), name: modifier.modifierName, pool: short(modifier.blueprintPool), off: modifier.enabled ? undefined : 1 }));
        for (const handler of generator.generators || []) {
            for (const contract of handler.contracts || []) {
                const templateData = template(short(contract.template));
                // Mission type: contract paramOverrides.missionTypeOverride, else handler contractParams.missionTypeOverride, else ContractTemplate.contractDisplayInfo.type.
                const type = short(contract.paramOverrides?.missionTypeOverride) || short(handler.contractParams?.missionTypeOverride) || short(templateData?.contractDisplayInfo?.type);
                if (!/^wikelo_/i.test(type || '')) continue;
                if (contract.notForRelease || contract.workInProgress || handler.notForRelease || handler.workInProgress) continue;
                // Required items: see tradeNeed(). ovUnused = the contract carries a hauling override that its template never reads; that content is left out of need.
                const { need, unused } = tradeNeed(templateData, contract, needOf);
                const give = []; const roll = []; const bp = [];
                for (const result of contract.contractResults?.contractResults || []) {
                    // Reward item: ContractResult_Item { entityClass, amount }.
                    if (result?.__type === 'ContractResult_Item') give.push({ i: itemIndex(short(result.entityClass)), n: result.amount });
                    // Weighted reward: ContractResult_ItemsWeighting.itemAwardStructure[] = ItemAwardWeightings { weighting, awards[] { entityClass, amountToAward } }.
                    else if (result?.__type === 'ContractResult_ItemsWeighting') for (const group of result.itemAwardStructure || []) roll.push({ w: num(group.weighting), items: (group.awards || []).map((award) => ({ i: itemIndex(short(award.entityClass)), n: award.amountToAward })) });
                    // Blueprint reward: BlueprintRewards { blueprintPool -> BlueprintPoolRecord, chance }.
                    else if (result?.__type === 'BlueprintRewards') bp.push([short(result.blueprintPool), num(result.chance)]);
                }
                const key = stringParam(contract.paramOverrides, 'Title') || stringParam(handler.contractParams, 'Title') || templateData?.contractDisplayInfo?.displayString?.[0];
                trades.push(prune({ id: contract.id, key: contract.debugName, type, name: title(key), a: accessIndex(handler, contract), need, ovUnused: unused.length ? 1 : undefined, give, roll, bp }));
            }
        }
    }
    const tempStruct = df.structByName.get('MissionModifier_TemporaryBlueprint');
    if (tempStruct && tempBlueprints.length !== df.instanceCount[tempStruct.index]) throw new Error(`Found ${tempBlueprints.length} MissionModifier_TemporaryBlueprint but the file holds ${df.instanceCount[tempStruct.index]}`);
    trades.sort((x, y) => x.key.localeCompare(y.key, 'en', { numeric: true }) || x.id.localeCompare(y.id));

    const out = {
        version: `${String(buildInfo.Branch || '').replace(/^sc-alpha-/, '')}.${buildInfo.RequestedP4ChangeNum || ''}`, gameVersion: buildInfo.Version, builtAt: new Date().toISOString(),
        source: 'game-files', sourceHash: createHash('sha256').update(df.buffer).digest('hex'), koSource: ko ? 'korean-patch' : undefined,
        note: '게임 파일 값이며 게임 안 실측값이 아니다. scu 와 pc(낱개)는 다른 단위다. 한 칸의 선택지(o)가 여럿이면 그중에서 고르는 것이고 합치지 않는다.',
        // Things the files do not settle. Screens must keep their wording neutral about these.
        unknowns: {
            poolDraw: 'BlueprintPoolRecord lists blueprints with a weight (all 1 in this build). The file does not say whether one blueprint is drawn per completion or all are granted, nor how already-owned blueprints are treated. A pool may list the same blueprint more than once; entries are kept as in the file and what a repeat means is not verified.',
            modifierApply: 'mods[].r values are the file values (modifierAtStart / modifierAtEnd, or the additive pair when add is 1). The record type says they change linearly between startQuality and endQuality; that a non-additive value is a multiplier of the base stat is our reading and is not stated in the files, least of all for stats without a display transformation (temperature, fire rate, integrity, damage mitigation).',
            statStacking: 'How two slots that change the same stat combine (add or multiply) is not stated in the files.',
            inclusion: 'inc is CraftingCostContext_ResultCompositionInclusion.option as written (1 Include, 0 Exclude). Its effect on what dismantling returns is not stated in the files.',
            quantityMultiplier: 'x is CraftingCostContext_QuantityMultiplier.multiplier. Whether the game multiplies the listed amount by it is not verified; scu / pc are the unmultiplied file values.',
            dismantle: 'efficiency and s are the generic dismantle values; how efficiency turns into returned amounts (rounding, quality) is not stated in the files.',
            tradeMax: 'A trade requirement with max 0 and min above 0 is written that way in the files (almost half of the item rows); whether 0 means "no upper limit" is not verified.',
            tradeOverrideUnused: 'A trade with ovUnused carries a hauling override (MissionPropertyValue_HaulingOrders) whose mission variable its template never reads. That content is not in need; whether the game uses it anyway is not verified.',
            tradeAccess: 'tradeAccess lists contract prerequisites as written (completed-contract tag names, crime stat range, reputation standing with its minReputation). Which contract gives a tag, and whether rep.max is an upper limit the player must not exceed, are not verified.',
            tempBlueprints: 'tempBlueprints lists MissionModifier_TemporaryBlueprint entries (a mission modifier that names a pool). What "temporary" means in play and whether these modifiers are used by released contracts is not verified.',
            stationCategories: 'stations[].make.cats / dismantle.cats can hold category ids that no blueprint uses and that are therefore not in categories[].',
            tradeRoll: 'roll[].w is ItemAwardWeightings.weighting as written; with a single group its meaning (chance or relative weight) is not verified.',
            modifierRange: 'A modifier without r names a stat but the file gives no value range (null pointer). partial marks a modifier where only some ranges were null.',
            stationLocations: 'Where fabricators stand in the world is not in the records read here.',
            sources: 'A blueprint that is in no pool and is not default-owned has no source in this file; shops and loot are not covered. Which contracts award a pool is in the missions data, not here.',
            eventTiers: 'eventTiers lists scenario reward tiers that name a pool; whether the event is running is decided by the server.',
        },
        globals: {
            // CraftingGlobalParams.defaultCompositionQuality / refiningQualityUnitMultiplier.
            defaultQuality: globals.defaultCompositionQuality, refiningQualityUnitMultiplier: globals.refiningQualityUnitMultiplier,
        },
        dismantle,
        categories: categories.list, itemTypes: itemTypes.list, makers: makers.list,
        slotNames: slotNames.list, stats: stats.list, mods: mods.list, materials: materials.list,
        recipes: recipes.list, blueprints, pools, eventTiers, stations,
        tempBlueprints,
        tradeItems: tradeItems.list, tradeAccess: tradeAccess.list, trades,
    };
    const report = {
        blueprints: blueprints.length, recipes: recipes.list.length, eventTiers: eventTiers.length, skipped, pools: Object.keys(pools).length, poolEntries, poolMissing,
        materials: materials.list.length, materialsMineable: materials.list.filter((m) => m.mine).length, materialsNotMineable: materials.list.filter((m) => !m.mine).map((m) => m.id),
        noOutput: blueprints.filter((b) => b.noOutput).map((b) => b.id),
        named: blueprints.filter((b) => b.name).length, namedKo: blueprints.filter((b) => b.name?.ko).length,
        trades: trades.length, stations: stations.length,
    };
    return { out, report };
}

const comparable = (data) => JSON.stringify({ ...data, builtAt: undefined });

function main() {
    const arg = (name) => { const index = process.argv.indexOf(name); return index > -1 ? process.argv[index + 1] : null; };
    const cacheDir = arg('--cache-dir');
    if (!cacheDir || !existsSync(resolve(cacheDir, 'Game2.dcb'))) { console.error('--cache-dir <Game2.dcb 가 있는 폴더> 가 필요합니다.'); process.exit(2); }
    const { out, report } = build({ cacheDir, koIni: arg('--ko-ini') });
    const previous = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : null;
    const same = previous && comparable(previous) === comparable(out);
    if (process.argv.includes('--check')) {
        if (!same) { console.error('data/crafting/blueprints.json 이 게임 파일에서 다시 만든 내용과 다릅니다. --check 없이 다시 만드세요.'); process.exit(1); }
        console.log('data/crafting/blueprints.json 은 최신입니다.');
        return;
    }
    // An unchanged rebuild keeps the previous builtAt so the file does not change for no reason.
    if (same) out.builtAt = previous.builtAt;
    mkdirSync(dirname(OUT_FILE), { recursive: true });
    const text = `${JSON.stringify(out)}\n`;
    writeFileSync(OUT_FILE, text);
    console.log(`제작 설계도: ${report.blueprints}개(제작법 ${report.recipes}가지, 이름 ${report.named}, 한글 ${report.namedKo}), 묶음 ${report.pools}개(항목 ${report.poolEntries}, 빈 참조 ${report.poolMissing}), 재료 ${report.materials}종(채광 연결 ${report.materialsMineable}), 교환 ${report.trades}건, 제작기 ${report.stations}대, ${Math.round(Buffer.byteLength(text) / 1024)}KB`);
    if (report.noOutput.length) console.log(`결과물 참조가 빈 설계도: ${report.noOutput.join(', ')}`);
    if (report.skipped.length) console.log(`제외한 기록: ${report.skipped.join(', ')}`);
    if (report.materialsNotMineable.length) console.log(`채광 자료에 없는 재료: ${report.materialsNotMineable.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
