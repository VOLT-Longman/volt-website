import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { missionOverview, cleanText, fillTokens, matchTagSearch, runsNeeded, stripPatchSuffix } from '../../scripts/contracts/build-contracts-data.mjs';

const data = (path) => JSON.parse(readFileSync(new URL(`../../data/${path}`, import.meta.url)));
const missions = data('contracts/missions.json');
const byName = (name) => missions.contracts.find((contract) => contract.n === name);
const english = (index) => missions.texts[index][0];

test('The published mission overview matches the complete catalog', () => {
    assert.equal(readFileSync(new URL('../../data/contracts/mission-list.json', import.meta.url), 'utf8'), missionOverview(missions));
});

test('Korean patch notes are removed from titles and placeholders stay readable', () => {
    assert.equal(stripPatchSuffix('화물 수송  <EM4>[BP?]</EM4> <EM4>[50-8,000 평판]</EM4>'), '화물 수송');
    assert.equal(stripPatchSuffix('<EM4>강조</EM4> 제목'), '<EM4>강조</EM4> 제목');
    assert.equal(cleanText('Go to <EM4>~mission(Location|Address)</EM4>.\\n\\n\\n\\nBye  '), 'Go to {Location|Address}.\n\nBye');
    assert.equal(cleanText('> About the job <'), '> About the job <');
    const tokens = { reputationrank: 'Master', 'contractor|bountytitle': 'Verified Bounty' };
    assert.equal(fillTokens('{ReputationRank} Rank - {Location|Address} - {Contractor|BountyTitle} - {TargetName}', tokens), 'Master Rank - {Location|Address} - Verified Bounty - {TargetName}');
});

test('tag search needs every positive tag, no negative tag, and accepts any alternative term', () => {
    const tags = new Set(['a', 'b', 'c']);
    assert.equal(matchTagSearch([{ pos: ['a', 'b'], neg: [] }], tags), true);
    assert.equal(matchTagSearch([{ pos: ['a', 'x'], neg: [] }], tags), false);
    assert.equal(matchTagSearch([{ pos: ['a'], neg: ['c'] }], tags), false);
    assert.equal(matchTagSearch([{ pos: ['x'], neg: [] }, { pos: ['c'], neg: ['z'] }], tags), true);
});

test('runs-to-rank arithmetic rounds up and never divides by a missing amount', () => {
    assert.equal(runsNeeded(0, 800, 100), 8);
    assert.equal(runsNeeded(750, 800, 100), 1);
    assert.equal(runsNeeded(900, 800, 100), 0);
    assert.equal(runsNeeded(0, 800, 0), null);
});

test('mission data is from the same game build as the other guides', () => {
    assert.equal(missions.gameVersion, data('loadout/meta.json').gameVersion);
    assert.equal(missions.sourceHash, data('contracts/hauling.json').sourceHash);
    assert.equal(missions.source, 'game-files');
    assert.deepEqual(missions.resultSlots, ['Completed', 'InProgress', 'Failed', 'Abandoned', 'Withdrawn']);
});

test('every released contract is present once with a stable id and a snapshot hash', () => {
    const { contracts, snapshot, stats } = missions;
    assert.equal(contracts.length, 2259);
    assert.equal(stats.contracts, contracts.length);
    assert.equal(contracts.filter((c) => c.src !== 'legacy').length, 1873);
    assert.equal(contracts.filter((c) => c.src === 'legacy').length, 386);
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const ids = [...contracts.map((c) => c.id), ...contracts.flatMap((c) => (c.v || []).map((v) => v.id))];
    assert.ok(ids.every((id) => guid.test(id) && !id.startsWith('00000000')));
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(contracts.flatMap((c) => c.v || []).length, stats.variants);
    assert.equal(snapshot.length, contracts.length);
    assert.ok(snapshot.every((hash) => /^[0-9a-f]{10}$/.test(hash)));
});

test('aUEC is given only where the game files hold a fixed amount', () => {
    const { contracts } = missions;
    for (const contract of contracts) {
        if (typeof contract.pay === 'object') assert.ok(Number.isInteger(contract.pay.a) && contract.pay.a > 0 && contract.pay.cur, contract.n);
        else assert.ok(contract.pay === 'calc' || contract.pay === 'none', contract.n);
    }
    assert.equal(missions.payout.calc, 'not in game data');
    assert.equal(contracts.filter((c) => c.src !== 'legacy' && typeof c.pay === 'object').length, 7);
    assert.ok(contracts.filter((c) => c.src === 'legacy').every((c) => typeof c.pay === 'object'));
    assert.equal(byName('HaulCargo_AToB_RefinedOre_Aluminium_Stanton_SupplyGrade1').pay.a, 59500);
    assert.equal(byName('HaulCargo_Multi3ToSingle_RawOre_Iron_Stanton1_SmallGrade').pay.a, 118750);
    // calculated contracts still carry the inputs that exist in the files
    const calculated = contracts.filter((c) => c.pay === 'calc');
    assert.ok(calculated.length > 1700);
    assert.ok(calculated.every((c) => c.time > 0 && c.diff && missions.difficultyProfiles[c.diff[0]] && c.diff.slice(1).every((level) => level >= 1 && level <= 8)));
});

test('reputation ladders support a runs-to-rank calculation', () => {
    const { scopes, contracts } = missions;
    for (const [id, scope] of Object.entries(scopes)) {
        assert.ok(scope.ranks.length > 1, id);
        assert.ok(scope.ranks.every((rank, index) => rank.name?.en && Number.isFinite(rank.min) && (index === 0 || rank.min >= scope.ranks[index - 1].min)), id);
    }
    const hauling = scopes.ReputationScope_Hauling.ranks;
    assert.equal(hauling.find((rank) => rank.name.en === 'Master').min, 237750);
    assert.ok(hauling.find((rank) => rank.name.en === 'Master').name.ko);
    for (const contract of contracts) {
        for (const key of ['min', 'max']) if (contract[key] !== undefined) assert.ok(scopes[contract.scope].ranks[contract[key]], `${contract.n} ${key}`);
        for (const entry of contract.rep || []) { assert.ok(scopes[entry.s] && missions.factions[entry.f], contract.n); assert.ok(Number.isInteger(entry.n) || entry.calc === 1, contract.n); }
    }
    const patrol = byName('FoxwellEnforcement_Patrol_Stanton_VeryEasy');
    const gain = patrol.rep.find((entry) => entry.s === patrol.scope && !entry.on).n;
    const standing = scopes[patrol.scope].ranks;
    assert.equal(gain, 100);
    assert.equal(runsNeeded(standing[0].min, standing[1].min, gain), 8);
});

test('every reference inside a contract points at an existing table row', () => {
    const m = missions;
    const site = (s) => (s.at ? s.at.every((i) => m.locations[i]) && s.n === s.at.length : m.tagSets[s.q] !== undefined);
    const rows = (haul) => haul.orders.flatMap((o) => o.rows).flatMap((row) => (row.or ? row.or.flat() : [row]));
    for (const c of m.contracts) {
        assert.ok(c.t === undefined || m.texts[c.t], c.n); assert.ok(c.d === undefined || m.texts[c.d], c.n); assert.ok(c.con === undefined || m.texts[c.con], c.n);
        assert.ok(c.type === undefined || m.types[c.type], c.n); assert.ok(c.by === undefined || m.factions[c.by], c.n); assert.ok(c.scope === undefined || m.scopes[c.scope], c.n);
        assert.ok(m.cooldowns[c.cd], c.n); assert.ok(c.combat === undefined || m.combats[c.combat], c.n); assert.ok(c.pp === undefined || m.partials[c.pp], c.n);
        assert.ok((c.loc || []).every((id) => m.localities[id]) && (c.at || []).every((id) => m.places[id]), c.n);
        assert.ok((c.sites || []).every(site), c.n); assert.ok((c.ev || []).every((id) => m.scenarios[id]), c.n);
        assert.ok((c.bp || []).every(([pool, chance]) => m.pools[pool].length && chance > 0 && chance <= 1), c.n);
        assert.ok((c.items || []).every(([id, amount]) => m.items[id] && amount > 0), c.n);
        if (c.haul) assert.ok(rows(c.haul).every((row) => (row.r ? m.resources[row.r] : row.e ? m.items[row.e] : row.es ? m.haulSets[row.es] : row.mi ? row.mi.every((id) => m.items[id]) : row.tagged === 1)), c.n);
        for (const v of c.v || []) assert.ok((v.loc || []).every((id) => m.localities[id]) && (v.at || []).every((id) => m.places[id]) && (v.sites || []).every(site), c.n);
    }
    for (const combat of m.combats) for (const entry of combat.ships || []) assert.ok(entry.g.every((g) => m.spawnGroups[g].s.every((slot) => (slot.alt || [slot]).every((option) => option[0] >= 0 && m.tagSets[option[1]] !== undefined))));
    // a pool entry is a blueprint id, [id, weight], or [null, weight] when the file's blueprint reference is empty
    for (const pool of Object.values(m.pools)) assert.ok(pool.every((entry) => (Array.isArray(entry) && entry[0] === null ? entry[1] > 0 : m.blueprints[Array.isArray(entry) ? entry[0] : entry])));
    assert.deepEqual(m.pools.BP_MISSIONREWARD_InterSec_Patrol[5], [null, 1]);
    assert.equal(m.stats.anomalies.poolEntryWithoutBlueprint, 2);
});

test('titles and briefings filled from a contractor placeholder keep Korean and every variant', () => {
    const { contracts, texts, stats } = missions;
    // title key is only "~mission(Contractor|RecoverSpaceTitleIntro)": both languages come from the organization strings
    assert.deepEqual(texts[byName('FTL_RecoverItem_Space_Stanton_Intro').t], ['NEW RETRIEVAL RUN AVAILABLE', '신규 회수 작업 가능']);
    assert.match(texts[byName('FTL_RecoverItem_Space_Stanton_VeryEasy').t][1], /회수 배달부 필요/);
    // briefing key is only "~mission(Contractor|HaulCargo_AtoB)": filled, with the other variants listed in dAlt
    const haul = byName('HaulCargo_AToB_RefinedOre_Aluminium_Stanton_SupplyGrade1');
    assert.match(english(haul.d), /^Hello,\n\nNeed a contractor for a simple cargo haul/);
    assert.ok(texts[haul.d][1]);
    assert.equal(haul.dAlt.length, 2);
    assert.ok(haul.dAlt.every((index) => texts[index] && index !== haul.d));
    assert.match(english(byName('CDF_StantonStar_SandboxCriminalKills').d), /^The Civilian Defense Force needs YOU/);
    // no briefing or title is left as a bare placeholder without being marked
    const bare = /^(\s*\{[^{}]*\}\s*)+$/;
    for (const c of contracts) {
        if (c.d !== undefined) assert.equal(bare.test(english(c.d)), c.dRaw === 1, c.n);
        if (c.t !== undefined) assert.ok(!/\{Contractor\|/i.test(english(c.t)), c.n);
        for (const index of [...(c.tAlt || []), ...(c.dAlt || [])]) assert.ok(texts[index], c.n);
    }
    assert.equal(stats.descPlaceholderOnly, 0);
    assert.ok(stats.titledKo >= 1900 && stats.describedKo >= 2230);
    assert.equal(stats.descVariants, contracts.filter((c) => c.dAlt).length);
});

test('results the file ties to no outcome are never shown as completion rewards', () => {
    const { contracts, stats } = missions;
    // raw: [false x5] ReputationScope_Affinity Positive_50 -> on: [] (absent `on` would mean "on completion")
    const handyman = byName('CFP_Pyro_RegionA_Rank0_Regional_Handyman');
    assert.deepEqual(handyman.rep.map((entry) => [entry.s, entry.n, entry.on]), [['FactionReputationScope', 25, undefined], ['ReputationScope_Affinity', 50, []]]);
    assert.ok(handyman.odd.includes('resultNoSlot'));
    assert.equal(contracts.filter((c) => (c.rep || []).some((entry) => entry.on && !entry.on.length)).length, 10);
    // raw: ContractResult_Item scrip x18 with [false x5] -> kept in res, not in items
    const patrol = byName('InterSec_Patrol_Nyx_VeryHard');
    assert.deepEqual(patrol.res, [['item', [], 'Carryable_1H_CY_Physical_Currency_Scrip_Merc_1', 18]]);
    assert.ok(!(patrol.items || []).some(([id]) => id === 'Carryable_1H_CY_Physical_Currency_Scrip_Merc_1'));
    assert.ok(missions.items.Carryable_1H_CY_Physical_Currency_Scrip_Merc_1);
    const kinds = contracts.flatMap((c) => c.res || []).filter((entry) => !entry[1].length).reduce((acc, [kind]) => { acc[kind] = (acc[kind] || 0) + 1; return acc; }, {});
    assert.deepEqual(kinds, { refund: 6, tags: 2, pay: 4, item: 3 });
    assert.ok(contracts.every((c) => c.refund === undefined));
    for (const c of contracts) {
        const noSlot = (c.res || []).some((entry) => !entry[1].length) || (c.rep || []).some((entry) => entry.on && !entry.on.length);
        assert.equal((c.odd || []).includes('resultNoSlot'), noSlot, c.n);
        for (const entry of c.res || []) assert.ok(entry[1].every((slot) => missions.resultSlots[slot]), c.n);
    }
    assert.equal(stats.resultNoSlot, 25);
    assert.match(missions.assumptions.resultSlots, /inferred/);
});

test('system source, missing defaults and raw ids are marked instead of asserted', () => {
    const { contracts, stats, scopes, items } = missions;
    // no Locality / Location prerequisite anywhere: the system comes from site tags and says so
    const patrol = byName('FoxwellEnforcement_Patrol_Stanton_VeryEasy');
    assert.deepEqual([patrol.sys, patrol.sysBy, patrol.loc, patrol.at], [['Stanton'], 'sites', undefined, undefined]);
    assert.equal(stats.sysFromSites, contracts.filter((c) => c.sysBy === 'sites').length);
    assert.equal(stats.sysFromSites, 109);
    assert.equal(byName('FoxwellEnforcement_Stanton_DefendShipNamed_E_NearLocation').sysBy, 'mixed');
    assert.ok(contracts.every((c) => !c.sysBy || c.sys));
    // no template -> no source for legality: the field is absent, not 0
    const noTemplate = byName('MW_CH3');
    assert.equal(noTemplate.illegal, undefined);
    assert.ok(noTemplate.odd.includes('templateMissing'));
    // record ids used as names carry raw: 1
    assert.deepEqual(items.RantaDung, { en: 'RantaDung', raw: 1 });
    assert.equal(scopes.ReputationScope_Affinity.ranks.filter((rank) => rank.name.raw).length, 36);
    assert.equal(stats.rawNames.ranks, 36);
    assert.equal(stats.rawNames.items, Object.values(items).filter((item) => item.raw).length);
    for (const item of Object.values(items)) assert.ok(item.raw === undefined || item.ko === undefined);
    // maxContainerSize -1 is kept as stored and never becomes the largest box
    const rows = byName('HaulCargo_SingleToMulti3_RefinedOre_Tungsten_Stanton1_SmallGrade').haul;
    assert.deepEqual(rows.orders[0].rows.map((row) => row.box), [4, -1, 4]);
    assert.equal(rows.maxBox, 4);
    assert.ok(contracts.every((c) => !c.haul || c.haul.maxBox === undefined || c.haul.maxBox > 0));
    assert.ok(contracts.filter((c) => c.src === 'legacy').every((c) => c.bySrc === 'rep' || c.bySrc === 'req'));
});

test('texts are clean and Korean comes from the patch without its annotations', () => {
    for (const [en, ko] of missions.texts) {
        assert.ok(en && !/~mission\(|<\/?EM\d>|LOC_UNINITIALIZED/.test(en), en.slice(0, 60));
        if (ko !== undefined) assert.ok(ko && ko !== en && !/~mission\(|<\/?EM\d>|\[BP\??\]|평판\]/.test(ko), ko.slice(0, 60));
    }
    const haul = byName('HaulCargo_SingleToMulti_Interstellar_Bulk_OrganiMass');
    assert.deepEqual(missions.texts[haul.t], ['Master Rank - Large Cargo Haul', '마스터급 - 대형 화물 수송']);
    assert.match(english(haul.d), /\{Location\|Address\}/);
    assert.ok(missions.stats.titled >= 2258 && missions.stats.titledKo >= 1790);
});

test('hauling orders keep each dropoff, and combat keeps groups with ship counts', () => {
    const haul = byName('HaulCargo_SingleToMulti_Interstellar_Bulk_OrganiMass').haul;
    assert.deepEqual(haul.orders.map((order) => order.rows[0].scu), [44, 44, 40]);
    assert.equal(haul.scu, 128); assert.equal(haul.maxBox, 16); assert.equal(haul.pickups, 1); assert.equal(haul.dropoffs, 3);
    // old-style missions: orders come from the mission flow, each once, with their SCU range
    const legacy = byName('HaulCargo_Multi3ToSingle_RawOre_Iron_Stanton1_SmallGrade').haul;
    assert.equal(legacy.orders[0].rows.length, 3);
    assert.deepEqual(legacy.scu, [14, 32]);
    const bounty = missions.combats[byName('BountyHuntersGuild_ShipWaveAttack_DrawOutBoss_Stanton_Hard').combat];
    const wave = missions.spawnGroups[bounty.ships.find((entry) => entry.p === 'WaveShips_BP').g[0]];
    assert.equal(wave.n, 'Wave1');
    assert.deepEqual(wave.s.map((slot) => slot[0]), [3, 2]);
    assert.match(missions.tagSets[wave.s[0][1]], /Medium_Fighter/);
});

test('sharing, legality, once-only and cooldown come from contract, handler or template defaults', () => {
    const { contracts, stats, cooldowns } = missions;
    assert.equal(stats.shareExplicit + stats.shareFromTemplate + stats.shareUnknown, contracts.length);
    assert.ok(stats.shareUnknown < 10);
    assert.ok(contracts.every((c) => (c.illegal === 0 || c.illegal === 1 || (c.illegal === undefined && c.odd.includes('templateMissing'))) && (c.once === 0 || c.once === 1)));
    assert.equal(contracts.filter((c) => c.illegal && c.src !== 'legacy').length, 372);
    // one-week lockout (10080 minutes) is what fixes the cooldown unit
    assert.ok(contracts.some((c) => cooldowns[c.cd].on === 1 && cooldowns[c.cd].p === 10080));
    assert.match(missions.units.cd, /^minutes/);
});

test('location resolver reports what it could and could not name', () => {
    const resolver = missions.stats.siteResolver;
    assert.ok(resolver.everySiteNamed > 700 && resolver.everySiteNamed < resolver.contractsWithSiteSearch);
    assert.equal(resolver.namedLocations, missions.locations.length);
    const haul = byName('HaulCargo_SingleToMulti_Interstellar_Bulk_OrganiMass');
    const dropoff = haul.sites.find((s) => s.k === 'dropoff' && s.at);
    assert.equal(missions.locations[dropoff.at[0]].name.en, 'Levski');
    assert.equal(missions.locations[dropoff.at[0]].sys, 'Nyx');
    assert.equal(missions.tagSets[haul.sites.find((s) => s.q !== undefined).q], 'Stanton1+Mining+HasFreightElevator');
    assert.deepEqual(haul.sys, ['Pyro']);
});
