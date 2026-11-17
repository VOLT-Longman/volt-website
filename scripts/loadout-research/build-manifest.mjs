// data/loadout-research/manifest.json: 조사 결과 파일 목록·건수·검증 상태 요약.
//   node scripts/loadout-research/build-manifest.mjs
import { readFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { OUT_DATA, writeData } from './lib.mjs';

const read = (file) => JSON.parse(readFileSync(resolve(OUT_DATA, file), 'utf8'));
if (existsSync(resolve(OUT_DATA, '.extract-stats.json'))) rmSync(resolve(OUT_DATA, '.extract-stats.json'));
const power = read('power-profiles.json'); const weapons = read('weapon-profiles.json'); const defense = read('defense-profiles.json'); const quantum = read('quantum-profiles.json');
const radar = read('radar-profiles.json'); const flight = read('flight-profiles.json'); const utility = read('utility-profiles.json'); const ident = read('component-identities.json'); const validation = read('validation-cases.json');
const count = (list, fn) => list.filter(fn).length;
const tally = (list, fn) => { const out = {}; for (const x of list) { const k = fn(x); if (k === undefined) continue; out[k] = (out[k] || 0) + 1; } return out; };
const guns = Object.values(weapons.guns); const powerItems = Object.values(power.items); const ships = Object.values(power.ships);
const draws = powerItems.flatMap((i) => (i.resource.states[0]?.deltas || []).filter((d) => d.consumption?.resource === 'Power').map((d) => ({ type: i.type, min: d.minimumConsumptionFraction ?? null, unit: d.consumption.unit })));
const ranges = powerItems.map((i) => ({ type: i.type, r: i.resource.states[0]?.powerRanges })).filter((x) => x.r);
const stats = {
    power: {
        itemsWithResourceData: powerItems.length, fixedItems: Object.keys(power.fixedItems).length, ships: ships.length,
        powerDrawUnits: tally(draws, (d) => d.unit), minimumConsumptionFractionByType: Object.fromEntries(Object.entries(tally(draws, (d) => `${d.type}:${d.min}`)).sort()),
        powerRangesShape: tally(ranges, (x) => `${x.type}: low ${x.r.low?.modifier}@${x.r.low?.start} / medium ${x.r.medium?.modifier}@${x.r.medium?.start} / high ${x.r.high?.modifier}@${x.r.high?.start}`),
        shipsWithWeaponPool: count(ships, (s) => s.powerPools.some((p) => p.itemType === 'WeaponGun')), weaponPoolSizes: tally(ships, (s) => s.powerPools.find((p) => p.itemType === 'WeaponGun')?.poolSize),
        shipsWithCrossSection: count(ships, (s) => s.crossSection), shipsWhereMinimumDemandExceedsGeneration: count(ships, (s) => s.defaultLoadoutTotals.powerUseMin > s.defaultLoadoutTotals.powerGeneration),
        shipsWhereMaximumDemandExceedsGeneration: count(ships, (s) => s.defaultLoadoutTotals.powerUseMax > s.defaultLoadoutTotals.powerGeneration),
    },
    weapons: {
        guns: guns.length, modeKinds: tally(guns, (g) => g.derived?.mode?.kind || 'none'), withSeveralModes: count(guns, (g) => g.modes.length > 1),
        sequenceRateDiffersFromInnerFireRate: count(guns, (g) => g.derived?.mode?.innerFireRate && g.derived.mode.innerFireRate !== g.derived.mode.fireRate),
        withHeatLimit: count(guns, (g) => g.derived?.heat?.overheats), withCapacitor: count(guns, (g) => g.regen), capacitorNeverEmpties: count(guns, (g) => g.derived?.capacitor?.neverEmpties),
        withSpinUp: count(guns, (g) => g.derived?.mode?.spinUpTime > 0), withTemperatureAfterFix: count(guns, (g) => g.simplifiedHeat?.temperatureAfterOverheatFix > 0),
        withPellets: count(guns, (g) => g.derived?.mode?.pellets > 1), withDetonation: count(guns, (g) => g.ammo?.detonation && Object.values(g.ammo.detonation.damage).some((v) => v > 0)), withDamageDrop: count(guns, (g) => g.ammo?.damageDrop && Object.keys(g.ammo.damageDrop).length),
        withPenetrationData: count(guns, (g) => g.ammo?.penetration?.basePenetrationDistance > 0), gimbalModifierRecords: tally(guns, (g) => g.gimbalModeModifier || 'none'),
        nonDefaultStatBlocks: tally(guns.flatMap((g) => Object.entries(g.statBlocks).filter(([, v]) => v && Object.keys(v).length).map(([k, v]) => `${k}: ${Object.keys(v).join(',')}`)), (x) => x),
        ordnance: Object.keys(weapons.ordnance).length, turrets: Object.keys(weapons.turrets).length, turretKinds: tally(Object.values(weapons.turrets), (t) => `${t.type}/${t.sub}`),
    },
    defense: {
        shields: Object.keys(defense.shields).length, ships: Object.keys(defense.ships).length, shieldFaceTypes: tally(Object.values(defense.ships).flatMap((s) => s.shieldEmitters), (e) => e.FaceType),
        shipsWithArmor: count(Object.values(defense.ships), (s) => s.armor.length), shipsWithHullParts: count(Object.values(defense.ships), (s) => s.hull.parts?.length), shipsWithDeflection: count(Object.values(defense.ships), (s) => s.armor[0]?.armorDeflection),
        shipsWithDeflectionHealthCurve: count(Object.values(defense.ships), (s) => s.armor[0]?.armorDeflection?.healthCurve?.length),
    },
    quantum: { drives: Object.keys(quantum.drives).length, jumpDrives: Object.keys(quantum.jumpDrives).length, shipsWithQuantumTank: count(Object.values(quantum.ships), (s) => s.quantumFuelCapacity), tankUnits: tally(Object.values(quantum.ships), (s) => s.capacityUnit || undefined) },
    radar: { radars: Object.keys(radar.radars).length, signatureTypes: radar.signatureTypes },
    flight: { ships: Object.keys(flight.ships).length, withController: count(Object.values(flight.ships), (s) => s.controller), withThrusters: count(Object.values(flight.ships), (s) => s.thrusters.length), withLifeSupport: count(Object.values(flight.ships), (s) => s.lifeSupport.length), afterburnerSource: tally(Object.values(flight.ships), (s) => s.controller?.afterburnerSource), thrustCapacityNewNonZero: count(Object.values(flight.ships), (s) => s.thrusters.some((t) => t.thrustCapacityNew > 0)) },
    utility: tally(Object.values(utility.items), (u) => u.type), identities: ident.totals,
    validation: { cases: validation.meta.cases, checks: validation.meta.checks, failedChecks: validation.meta.failedChecks, byStatus: tally(validation.cases, (c) => c.status), siteCalculatorDiffering: validation.siteCalculatorComparison.differing },
};
const files = readdirSync(OUT_DATA).filter((f) => f.endsWith('.json') && f !== 'manifest.json').sort().map((f) => {
    const buffer = readFileSync(resolve(OUT_DATA, f));
    return { file: `data/loadout-research/${f}`, bytes: statSync(resolve(OUT_DATA, f)).size, sha256: createHash('sha256').update(buffer).digest('hex') };
});
writeData('manifest.json', {
    title: 'VOLT 로드아웃 조사 자료', game: { build: power.meta.gameBuild, branch: power.meta.gameBranch, changelist: power.meta.gameChangelist, buildDate: power.meta.gameBuildDate },
    researchedAt: power.meta.researchedAt, uex: { api: ident.meta.uexApi, fetchedAt: ident.meta.uexFetchedAt },
    statusLegend: { verified: '원본 값과 계산이 한 가지로 정해짐', conflicting: '자료끼리 또는 해석끼리 어긋남 — 값을 둘 이상 실음', unavailable: '이 자료만으로는 확정할 수 없음 — null 로 두고 필요한 후속 자료를 적음' },
    keys: '부품·함선 연결은 uuid(게임 레코드 GUID)와 cls(클래스명)로 한다. name 은 표시용이다.',
    nullRule: 'null = 확인하지 못한 값. 원본에 없는 칸(해당 없음)은 싣지 않는다. 0 은 원본이 실제로 0 일 때만 쓴다.',
    files, stats,
    sourcesNotCommitted: ['Game2.dcb · 함선 구조 XML (게임 원본, 저장소 밖 캐시 폴더)', 'UEX API 원본 응답 (저장소 밖 캐시 폴더)'],
    docs: ['docs/loadout-research/README.md', 'docs/loadout-research/sources.md', 'docs/loadout-research/formulas.md', 'docs/loadout-research/discrepancies.md', 'docs/loadout-research/implementation-map.md'],
});
console.log(JSON.stringify(stats));
