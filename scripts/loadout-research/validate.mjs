// 검증 사례를 만들고 검산한다.
//   node scripts/loadout-research/validate.mjs
// 입력은 data/loadout-research/*.json(추출 결과)에서 읽고, 예상 결과는 이 파일에 손으로 계산해 적어 둔 값이다.
// 추출값 + 기준 계산(calc.mjs)이 예상 결과를 허용 오차 안에서 재현하는지 확인한 뒤 validation-cases.json 을 쓴다.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO, OUT_DATA, writeData } from './lib.mjs';
import * as calc from './calc.mjs';

const require = createRequire(import.meta.url);
const site = require(resolve(REPO, 'js/loadout-calc.js'));
const read = (file) => JSON.parse(readFileSync(resolve(OUT_DATA, file), 'utf8'));
const items = JSON.parse(readFileSync(resolve(REPO, 'data/loadout/items.json'), 'utf8')).items;
const weapons = read('weapon-profiles.json'); const power = read('power-profiles.json'); const defense = read('defense-profiles.json');
const quantum = read('quantum-profiles.json'); const flight = read('flight-profiles.json'); const ident = read('component-identities.json'); read('shop-coverage.json'); // 읽히는지만 확인
const gun = (cls) => Object.values(weapons.guns).find((g) => g.cls === cls);
const byCls = (map, cls) => Object.values(map).find((x) => x.cls === cls);
const SRC = { weapon: 'data/loadout-research/weapon-profiles.json', power: 'data/loadout-research/power-profiles.json', defense: 'data/loadout-research/defense-profiles.json', quantum: 'data/loadout-research/quantum-profiles.json', flight: 'data/loadout-research/flight-profiles.json', ident: 'data/loadout-research/component-identities.json', shops: 'data/loadout-research/shop-coverage.json' };

const cases = [];
let failed = 0;
// checks: [{ name, actual, expected, tolerance }] — tolerance 는 절대 오차(숫자) 또는 0(정확히 같음).
function add(def) {
    const checks = def.checks.map((c) => {
        const pass = typeof c.expected === 'number' && typeof c.actual === 'number' ? Math.abs(c.actual - c.expected) <= (c.tolerance ?? 0) : JSON.stringify(c.actual) === JSON.stringify(c.expected);
        if (!pass) { failed += 1; console.error(`FAIL ${def.id} · ${c.name}: actual ${JSON.stringify(c.actual)} expected ${JSON.stringify(c.expected)}`); }
        return { ...c, pass };
    });
    cases.push({ ...def, checks, pass: checks.every((c) => c.pass) });
}

// 1. 실탄 과열 -------------------------------------------------------------
{
    const g = gun('BEHR_BallisticGatling_S4'); const d = g.derived; const h = g.simplifiedHeat;
    add({
        id: 'ballistic-overheat-ad4b', topic: '실탄 무기 과열', status: 'verified',
        inputs: { uuid: g.uuid, cls: g.cls, fireRate: d.mode.fireRate, heatPerShot: d.mode.heatPerShot, overheatTemperature: h.overheatTemperature, coolingPerSecond: h.coolingPerSecond, timeTillCoolingStarts: h.timeTillCoolingStarts, overheatFixTime: h.overheatFixTime, temperatureAfterOverheatFix: h.temperatureAfterOverheatFix, damagePerShot: d.alpha.total, spinUpTime: d.mode.spinUpTime },
        steps: ['발사 간격 = 60 ÷ 900 = 0.066667초', '발 사이 식는 양 = max(0, 0.066667 − 0.485) × 31.7 = 0 (식기 시작 전에 다음 발)', '과열까지 발사 수 = ceil((100 − 0.5080645) ÷ 0.5080645) + 1 = 197발', '사격 시간(마지막 간격 제외) = 196 × 0.066667 = 13.0667초', '주기 = 13.0667 + 2.23 = 15.2967초', '지속 DPS = 84.4 × 197 ÷ 15.2967 = 1086.95', '순간 DPS = 84.4 × 15 = 1266'],
        checks: [
            { name: '과열까지 발사 수', actual: d.heat.shotsToOverheat, expected: 197, tolerance: 0 },
            { name: '순간 DPS', actual: d.burstDps, expected: 1266, tolerance: 0.01 },
            { name: '지속 DPS (마지막 간격 제외)', actual: d.sustained.variants.find((v) => v.boundary === 'excludingLastInterval').value, expected: 1086.95, tolerance: 0.05 },
            { name: '지속 DPS (마지막 간격 포함)', actual: d.sustained.variants.find((v) => v.boundary === 'includingLastInterval').value, expected: 1082.24, tolerance: 0.05 },
            { name: '지속 DPS (회전 시작 시간 포함)', actual: d.sustained.variants.find((v) => v.boundary === 'excludingLastInterval+spinUpTime').value, expected: 1073.06, tolerance: 0.05 },
            { name: '사이트 계산과 일치', actual: Number(site.weaponSustain(items[g.uuid]).dps.toFixed(2)), expected: 1086.95, tolerance: 0.6 },
        ],
        tolerance: '발사 수는 정확히, DPS는 ±0.05 (사이트 자료는 열을 소수 4자리로 반올림하므로 ±0.6)', sources: [SRC.weapon, 'EntityClassDefinition.BEHR_BallisticGatling_S4 → SCItemWeaponComponentParams.connectionParams.simplifiedHeatParams, fireActions[0]'],
    });
}
// 2. 실탄: 과열하지 않는 경우 + 연사 속도 출처 -----------------------------------
{
    const g = gun('BEHR_BallisticCannon_S4'); const d = g.derived; const h = g.simplifiedHeat;
    const alt = calc.heatCycle({ fireRate: d.mode.innerFireRate, heatPerShot: d.mode.heatPerShot, heat: h });
    add({
        id: 'ballistic-fire-rate-source-c788', topic: '실탄 무기 과열 · C788 순간 DPS', status: 'conflicting',
        inputs: { uuid: g.uuid, cls: g.cls, sequenceDelayRpm: d.mode.fireRate, innerFireRate: d.mode.innerFireRate, damagePerShot: d.alpha.total, heatPerShot: d.mode.heatPerShot, coolingPerSecond: h.coolingPerSecond, timeTillCoolingStarts: h.timeTillCoolingStarts },
        steps: ['fireActions[0] 은 순차 사격(Sequence)이고 항목 간격이 40 RPM, 안쪽 동작의 fireRate 는 50', '40 RPM 기준: 순간 DPS = 975 × 40 ÷ 60 = 650', '50 RPM 기준: 순간 DPS = 975 × 50 ÷ 60 = 812.5', '40 RPM 에서는 발 사이 식는 양 (1.5 − 0.84) × 25.4 = 16.764 > 발당 열 12 → 과열하지 않음', '50 RPM 에서는 (1.2 − 0.84) × 25.4 = 9.144 < 12 → 32발째에 과열'],
        checks: [
            { name: '순간 DPS (순차 간격 40 RPM)', actual: d.burstDps, expected: 650, tolerance: 0.01 },
            { name: '순간 DPS (안쪽 fireRate 50)', actual: Number((d.alpha.total * d.mode.innerFireRate / 60).toFixed(2)), expected: 812.5, tolerance: 0.01 },
            { name: '40 RPM 에서 과열 여부', actual: d.heat.overheats, expected: false },
            { name: '50 RPM 에서 과열까지 발사 수', actual: alt.shotsToOverheat, expected: 32, tolerance: 0 },
            { name: '사이트 순간 DPS', actual: Number(site.weaponStats(items[g.uuid]).dps.toFixed(2)), expected: 650, tolerance: 0.01 },
        ],
        tolerance: '±0.01', sources: [SRC.weapon, 'EntityClassDefinition.BEHR_BallisticCannon_S4 → fireActions[0].sequenceEntries[0].{delay,unit} / .weaponAction.fireRate'],
        open: '게임이 실제로 쓰는 값이 순차 간격(40)인지 안쪽 fireRate(50)인지는 게임 안 측정이 필요. 다른 계산기와의 162.5 차이는 이 두 값의 차이와 같다.',
    });
}
// 3. 에너지 무기 축전·충전 ----------------------------------------------------
{
    const g = gun('AMRS_LaserCannon_S3'); const d = g.derived; const v = (b) => d.sustained.variants.find((x) => x.boundary === b).value;
    add({
        id: 'energy-capacitor-omnisky-ix', topic: '에너지 무기 축전·충전', status: 'conflicting',
        inputs: { uuid: g.uuid, cls: g.cls, fireRate: d.mode.fireRate, damagePerShot: d.alpha.total, maxAmmoLoad: g.regen.maxAmmoLoad, maxRegenPerSec: g.regen.maxRegenPerSec, regenerationCooldown: g.regen.regenerationCooldown, requestedAmmoLoad: g.regen.requestedAmmoLoad, regenerationCostPerBullet: g.regen.regenerationCostPerBullet },
        steps: ['발사 간격 = 60 ÷ 150 = 0.4초 < 충전 지연 0.5초 → 쏘는 동안 충전되지 않음', '탄창 25발을 비우는 시간: 마지막 간격 포함 10초 / 제외 9.6초', '재충전 = 0.5 + 25 ÷ 3 = 8.8333초', '지속 DPS(포함) = 25 × 218.7 ÷ 18.8333 = 290.31', '지속 DPS(제외) = 25 × 218.7 ÷ 18.4333 = 296.61', '쏘는 중에도 충전된다고 보면 초당 3발 ≥ 2.5발 → 546.75(순간 DPS 와 같음)'],
        checks: [
            { name: '순간 DPS', actual: d.burstDps, expected: 546.75, tolerance: 0.01 },
            { name: '지속 DPS (마지막 간격 포함)', actual: v('includingLastInterval'), expected: 290.31, tolerance: 0.02 },
            { name: '지속 DPS (마지막 간격 제외)', actual: v('excludingLastInterval'), expected: 296.61, tolerance: 0.02 },
            { name: '지속 DPS (사격 중 충전 허용)', actual: v('regenNotInterruptedByFiring'), expected: 546.75, tolerance: 0.01 },
            { name: '사이트 계산(포함 방식)', actual: Number(site.weaponSustain(items[g.uuid]).dps.toFixed(2)), expected: 290.31, tolerance: 0.05 },
        ],
        tolerance: '±0.02', sources: [SRC.weapon, 'EntityClassDefinition.AMRS_LaserCannon_S3 → SCItemWeaponComponentParams.weaponRegenConsumerParams'],
        open: '사격 중 충전이 끊기는지(regenerationCooldown 이 매 발 다시 시작하는지)는 실행 규칙. 세 값 사이 어느 쪽인지 게임 안 측정 필요.',
    });
}
// 4. 스토커 + AD4B + Omnisky IX ×2 -------------------------------------------
{
    const a = gun('BEHR_BallisticGatling_S4'); const o = gun('AMRS_LaserCannon_S3');
    const pick = (g, b) => g.derived.sustained.variants.find((x) => x.boundary === b).value;
    const siteSum = site.weaponSustain(items[a.uuid]).dps + 2 * site.weaponSustain(items[o.uuid]).dps;
    add({
        id: 'stalker-ad4b-omnisky-sustained', topic: '지속 DPS 차이 원인 (어벤저 스토커 · AD4B + Omnisky IX 2정)', status: 'conflicting',
        inputs: { ship: 'aegs_avenger_stalker', guns: [{ cls: a.cls, count: 1 }, { cls: o.cls, count: 2 }] },
        steps: ['순간 DPS = 1266 + 2 × 546.75 = 2359.5', '사이트 방식(과열=마지막 간격 제외, 축전=포함) = 1086.95 + 2 × 290.31 = 1667.57', '둘 다 마지막 간격 포함 = 1082.24 + 2 × 290.31 = 1662.86', '둘 다 제외 = 1086.95 + 2 × 296.61 = 1680.17', '사격 중 충전 허용 = 1086.95 + 2 × 546.75 = 2180.45'],
        checks: [
            { name: '순간 DPS 합', actual: a.derived.burstDps + 2 * o.derived.burstDps, expected: 2359.5, tolerance: 0.02 },
            { name: '사이트 방식', actual: Number(siteSum.toFixed(2)), expected: 1667.57, tolerance: 0.7 },
            { name: '둘 다 포함', actual: Number((pick(a, 'includingLastInterval') + 2 * pick(o, 'includingLastInterval')).toFixed(2)), expected: 1662.86, tolerance: 0.1 },
            { name: '둘 다 제외', actual: Number((pick(a, 'excludingLastInterval') + 2 * pick(o, 'excludingLastInterval')).toFixed(2)), expected: 1680.17, tolerance: 0.1 },
            { name: '사격 중 충전 허용', actual: Number((pick(a, 'excludingLastInterval') + 2 * pick(o, 'regenNotInterruptedByFiring')).toFixed(2)), expected: 2180.45, tolerance: 0.1 },
        ],
        tolerance: '±0.1 (사이트 값은 반올림 자료 때문에 ±0.7)', sources: [SRC.weapon],
        open: '경계 조건만으로는 17.3(약 1%)까지만 벌어진다. 그보다 큰 차이는 사격 중 충전 여부, 짐벌 모드의 연사 0.85배, 전력 배분에 따른 탄창 크기 중 하나에서 온다.',
    });
}
// 5. 충전식 무기 ---------------------------------------------------------------
{
    const g = gun('BANU_TachyonCannon_S2'); const d = g.derived;
    add({
        id: 'charged-singe-s2', topic: '충전식 무기', status: 'conflicting',
        inputs: { uuid: g.uuid, cls: g.cls, chargeTime: d.mode.chargeTime, cooldownTime: d.mode.cooldownTime, fireRate: d.mode.fireRate, damagePerShot: d.alpha.total, regenerationCooldown: g.regen.regenerationCooldown, maxRegenPerSec: g.regen.maxRegenPerSec },
        steps: ['주기(충전 + 대기 + 발사 간격) = 1.75 + 0 + 0.6667 = 2.4167초 → 초당 0.41379발 → 195.52 DPS', '주기(충전만) = 1.75초 → 초당 0.57143발 → 270.0 DPS', '발 사이 2.4167초 > 충전 지연 1.73초 → 사이에 (2.4167 − 1.73) × 3 = 2.06발 충전 ≥ 1발 → 탄창이 줄지 않음 → 지속 = 순간'],
        checks: [
            { name: '순간 DPS (충전+간격)', actual: d.burstDps, expected: 195.52, tolerance: 0.02 },
            { name: '순간 DPS (충전만)', actual: Number((d.alpha.total * d.fireCycle.variants.chargeOnly).toFixed(2)), expected: 270, tolerance: 0.02 },
            { name: '탄창이 비지 않음', actual: d.capacitor.neverEmpties, expected: true },
            { name: '지속 DPS(기준)', actual: d.sustained.reference, expected: 195.52, tolerance: 0.02 },
            { name: '사이트 지속 DPS(발 사이 충전 미반영)', actual: Number(site.weaponSustain(items[g.uuid]).dps.toFixed(2)), expected: 167.6, tolerance: 0.05 },
        ],
        tolerance: '±0.02', sources: [SRC.weapon, 'EntityClassDefinition.BANU_TachyonCannon_S2 → fireActions[0] (SWeaponActionFireChargedParams)'],
        open: '사이트는 발 사이 충전을 반영하지 않아 167.6 으로 낮게 나온다(수정 대상). 충전 주기에 발사 간격이 더해지는지는 미확인.',
    });
}
// 6. 전력 부족과 장비 끄기 ------------------------------------------------------
{
    const s = power.ships.aegs_avenger_stalker; const t = s.defaultLoadoutTotals;
    const draw = (cls) => { const e = byCls(power.items, cls) || power.fixedItems[cls]; const d = e.resource.states[0].deltas.find((x) => x.consumption?.resource === 'Power'); return { max: d.consumption.value, min: Number((d.consumption.value * (d.minimumConsumptionFraction ?? 0)).toFixed(4)), unit: d.consumption.unit }; };
    const cooler = draw('COOL_AEGS_S01_Bracer_SCItem'); const shield = draw('SHLD_ASAS_S01_Shimmer_SCItem'); const radar = draw('RADR_GRNP_S01_Ecouter');
    add({
        id: 'power-shortage-stalker-default', topic: '전력 부족과 장비 끄기', status: 'conflicting',
        inputs: { ship: 'aegs_avenger_stalker', powerGeneration: t.powerGeneration, powerUseMax: t.powerUseMax, powerUseMin: t.powerUseMin, cooler, shield, radar, weaponPool: s.powerPools.find((p) => p.itemType === 'WeaponGun') },
        steps: ['기본 장착의 발전량 14칸, 모든 장비 최대 요구 합 23.1, 최소 요구 합 10.1', '최대 요구 기준 부족분 = 23.1 − 14 = 9.1 → 전부 최대로는 못 돌림', '최소 요구 합 10.1 ≤ 14 → 모든 장비를 최소로는 켤 수 있음', '냉각기 1대: 최대 3칸, 최소 3 × 0.3333 = 1칸. 끄면 최대 3칸이 남는다', '실드 1대: 1칸(최소 비율 1 → 줄일 수 없음, 켜거나 끄거나)', '무기는 함선의 고정 무기 묶음(4칸)에서 나눠 받는다'],
        checks: [
            { name: '발전량', actual: t.powerGeneration, expected: 14, tolerance: 0 },
            { name: '최대 요구 합', actual: t.powerUseMax, expected: 23.1, tolerance: 0.001 },
            { name: '최소 요구 합', actual: t.powerUseMin, expected: 10.1, tolerance: 0.01 },
            { name: '최대 기준 부족분', actual: Number((t.powerUseMax - t.powerGeneration).toFixed(3)), expected: 9.1, tolerance: 0.001 },
            { name: '냉각기 최소 요구', actual: cooler.min, expected: 1, tolerance: 0.001 },
            { name: '실드 최소 요구', actual: shield.min, expected: 1, tolerance: 0 },
            { name: '무기 묶음 크기', actual: s.powerPools.find((p) => p.itemType === 'WeaponGun').poolSize, expected: 4, tolerance: 0 },
        ],
        tolerance: '정확히 (합계는 ±0.01)', sources: [SRC.power, '함선 SItemPortContainerComponentParams.resourceNetworkPowerPools', '각 부품 ItemResourceComponentParams.states[Online].deltas[]'],
        open: '부족할 때 어떤 장비부터 줄이는지(defaultPriority 의 방향), 받은 전력과 성능의 관계(powerRanges 적용식)는 자료에 식이 없어 확정 불가.',
    });
}
// 7. SCM/NAV 전환 ---------------------------------------------------------------
{
    const ex = power.global.masterModeExclusions.exclusions; const c = flight.ships.aegs_avenger_stalker.controller;
    add({
        id: 'master-mode-scm-nav', topic: 'SCM/NAV 전환', status: 'verified',
        inputs: { exclusions: ex, ship: 'aegs_avenger_stalker', scmSpeed: c.scmSpeed, maxSpeed: c.maxSpeed, boostSpeedForward: c.boostSpeedForward },
        steps: ['전역 제외 목록: Shield 는 Navigation 에서 꺼짐, QuantumDrive 는 SCM 에서 꺼짐', '무기·미사일은 전역 목록에 없음 → 부품별 masterModeExclusionsOverride 가 없으면 자료상 제한 없음', '스토커: SCM 262 m/s, 부스트 전진 610 m/s, NAV 최고 1425 m/s'],
        checks: [
            { name: 'NAV 에서 꺼지는 종류', actual: ex.filter((e) => e.excludedIn.includes('Navigation')).map((e) => e.itemType), expected: ['Shield'] },
            { name: 'SCM 에서 꺼지는 종류', actual: ex.filter((e) => e.excludedIn.includes('SCM')).map((e) => e.itemType), expected: ['QuantumDrive'] },
            { name: 'SCM 속도', actual: c.scmSpeed, expected: 262, tolerance: 0 },
            { name: 'NAV 최고 속도', actual: c.maxSpeed, expected: 1425, tolerance: 0 },
        ],
        tolerance: '정확히', sources: [SRC.power, 'MasterModeExclusionGlobalParams.MasterModeExclusionGlobalParams', SRC.flight],
        open: 'NAV 에서 무기가 실제로 잠기는 규칙은 이 목록에 없다(실행 코드 또는 다른 자료). 게임 안 확인 필요.',
    });
}
// 8. 실드·장갑 조건 변경 ---------------------------------------------------------
{
    const sh = byCls(defense.shields, 'SHLD_ASAS_S01_Shimmer_SCItem'); const armor = defense.ships.aegs_avenger_stalker.armor[0];
    const phys = sh.absorption.physical; const en = sh.absorption.energy;
    const through = (dmg, absorb, mult) => Number((dmg * (1 - absorb) * mult).toFixed(3));
    add({
        id: 'shield-armor-states-stalker', topic: '실드·장갑 조건 변경', status: 'conflicting',
        inputs: { target: 'aegs_avenger_stalker', shield: { cls: sh.cls, count: 2, MaxShieldHealth: sh.params.MaxShieldHealth, MaxShieldRegen: sh.params.MaxShieldRegen, DamagedRegenDelay: sh.params.DamagedRegenDelay, DownedRegenDelay: sh.params.DownedRegenDelay, absorption: sh.absorption, resistance: sh.resistance }, armor: { cls: armor.cls, damageMultiplier: armor.damageMultiplier, deflectionValue: armor.armorDeflection?.deflectionValue, penetration: armor.armorPenetrationResistance }, shots: [{ weapon: 'BEHR_BallisticCannon_S4', physical: 975 }, { weapon: 'AMRS_LaserCannon_S3', energy: 218.7 }] },
        steps: ['실드량 합 = 2 × 2244 = 4488, 재생 합 = 2 × 426 = 852/초, 피격 뒤 3.5초·파괴 뒤 7초 지연', '실탄 975: 실드 흡수율 0–0.45 → 실드를 지나 선체로 가는 양 536.25–975', '선체 쪽은 장갑 배수 0.8 → 429–780', '에너지 218.7: 흡수율 1 → 실드가 있는 동안 선체 피해 0', '실드가 꺼지면: 실탄 975 × 0.8 = 780, 에너지 218.7 × 0.65 = 142.155'],
        checks: [
            { name: '실드량 합', actual: 2 * sh.params.MaxShieldHealth, expected: 4488, tolerance: 0 },
            { name: '실탄 흡수율 범위', actual: [phys.min, phys.max], expected: [0, 0.45] },
            { name: '에너지 흡수율 범위', actual: [en.min, en.max], expected: [1, 1] },
            { name: '실탄·실드 있음·흡수 최대일 때 선체 피해', actual: through(975, phys.max, armor.damageMultiplier.physical), expected: 429, tolerance: 0.01 },
            { name: '실탄·실드 없음 선체 피해', actual: through(975, 0, armor.damageMultiplier.physical), expected: 780, tolerance: 0.01 },
            { name: '에너지·실드 있음 선체 피해', actual: through(218.7, en.max, armor.damageMultiplier.energy), expected: 0, tolerance: 0.001 },
            { name: '에너지·실드 없음 선체 피해', actual: through(218.7, 0, armor.damageMultiplier.energy), expected: 142.155, tolerance: 0.01 },
        ],
        tolerance: '±0.01', sources: [SRC.defense, 'SCItemShieldGeneratorParams.ShieldAbsorption/ShieldResistance', 'SCItemVehicleArmorParams.damageMultiplier'],
        open: '흡수율이 Min–Max 사이에서 무엇에 따라 움직이는지(실드 잔량으로 추정), 도탄 기준(deflectionValue 11/9)과 비교되는 탄 쪽 값, 관통 거리와 부위 두께의 판정은 자료에 식이 없다. 그래서 격파 시간은 계산하지 않는다.',
    });
}
// 9. 퀀텀: 짧은 거리와 긴 거리 ---------------------------------------------------
{
    const d = byCls(quantum.drives, 'QDRV_TARS_S01_Expedition_SCItem'); const ship = quantum.ships.aegs_avenger_stalker; const p = d.params;
    const t = (gm) => calc.quantumTime({ distanceM: gm * 1e9, driveSpeed: p.driveSpeed, stageOneAccelRate: p.stageOneAccelRate, stageTwoAccelRate: p.stageTwoAccelRate, spoolUpTime: p.spoolUpTime });
    const short = t(0.05); const long = t(30);
    add({
        id: 'quantum-short-long-expedition', topic: '짧은 거리와 긴 거리 퀀텀 이동 · 항속 61 Gm', status: 'conflicting',
        inputs: { ship: 'aegs_avenger_stalker', drive: d.cls, driveUuid: d.uuid, driveSpeed: p.driveSpeed, stageOneAccelRate: p.stageOneAccelRate, stageTwoAccelRate: p.stageTwoAccelRate, spoolUpTime: p.spoolUpTime, cooldownTime: p.cooldownTime, quantumFuelRequirement: d.quantumFuelRequirement, quantumFuelCapacity: ship.quantumFuelCapacity, capacityUnit: ship.capacityUnit, distancesGm: [0.05, 30] },
        steps: ['항속 = 0.6 SCU ÷ 0.0098 = 61.22 Gm', '같은 탱크로 120 Gm 이 나오려면 요구량이 0.005 여야 한다(0.6 ÷ 0.005 = 120)', '가속·감속 구간 거리(2단계 가속 기준) = 속도² ÷ 가속 = 1.694 Gm', '0.05 Gm: 최고 속도에 못 미침 → 2 × √(5e7 ÷ 21154770) = 3.07초', '30 Gm: 30e9 ÷ 189309104 + 189309104 ÷ 21154770 = 158.47 + 8.95 = 167.42초', '스풀링 4.6초는 따로 더한다. 쿨다운 11.4초는 도착 뒤 다음 이동까지의 대기라 이동 시간에 넣지 않는다'],
        checks: [
            { name: '항속(Gm)', actual: calc.quantumRange(ship.quantumFuelCapacity, d.quantumFuelRequirement), expected: 61.224, tolerance: 0.01 },
            { name: '120 Gm 에 필요한 요구량', actual: Number((ship.quantumFuelCapacity / 120).toFixed(5)), expected: 0.005, tolerance: 0.00001 },
            { name: '짧은 거리: 최고 속도 도달 여부', actual: short.constantA2.reachesTopSpeed, expected: false },
            { name: '짧은 거리 이동 시간', actual: short.constantA2.travel, expected: 3.07, tolerance: 0.01 },
            { name: '긴 거리 이동 시간', actual: long.constantA2.travel, expected: 167.42, tolerance: 0.02 },
            { name: '사이트 계산(긴 거리, 스풀링 포함)', actual: Number(site.quantumTravelTime({ speed: p.driveSpeed, accel: p.stageTwoAccelRate, spool: p.spoolUpTime }, 30).toFixed(2)), expected: 172.02, tolerance: 0.02 },
        ],
        tolerance: '시간 ±0.02초, 항속 ±0.01 Gm', sources: [SRC.quantum, 'EntityClassDefinition.QDRV_TARS_S01_Expedition_SCItem → SCItemQuantumDriveParams', 'EntityClassDefinition.QTNK_AEGS_Avenger_Stalker → ResourceContainer.capacity.standardCargoUnits'],
        open: '이 빌드(4.10.0, 13165946)의 Expedition 요구량은 0.0098 이다. 120 Gm 은 요구량 0.005 또는 탱크 1.176 SCU 일 때만 나오므로 단위·공식이 아니라 원본 값(자료 판 또는 다른 부품) 차이다. 어느 쪽인지는 상대 계산기의 입력값을 봐야 확정된다. 1·2단계 가속의 전환 조건도 미확인.',
    });
}
// 10. UUID 없는 판매 품목 --------------------------------------------------------
{
    const none = ident.uexItemsWithoutUuid; const obs = none.find((n) => n.uexName === 'Observer'); const go = none.find((n) => n.uexName === 'Observer-Go');
    add({
        id: 'uex-item-without-uuid', topic: 'UUID 없는 판매 품목', status: 'unavailable',
        inputs: { totals: { withoutUuid: ident.totals.withoutUuid, withoutUuidWithShops: ident.totals.withoutUuidWithShops }, examples: [{ uexItemId: obs.uexItemId, uexName: obs.uexName, uexSize: obs.uexSize }, { uexItemId: go.uexItemId, uexName: go.uexName, uexSize: go.uexSize }] },
        steps: ['UEX 품목에 uuid 가 비어 있으면 UUID 로 연결할 수 없다', '이름이 정확히 같고 규격·종류가 맞는 게임 부품이 하나뿐이면 "후보"로만 적는다(자동 연결 안 함)', 'Observer: 후보 1개(RADR_CHCO_S02_Observer, S2)', 'Observer-Go: 이름은 같지만 UEX 는 S1, 게임 자료는 S0 → 규격 불일치로 보류'],
        checks: [
            { name: 'UUID 없는 품목 수', actual: ident.totals.withoutUuid, expected: 100, tolerance: 0 },
            { name: '그중 판매 기록이 있는 품목 수', actual: ident.totals.withoutUuidWithShops, expected: 77, tolerance: 0 },
            { name: 'Observer 후보', actual: obs.candidates.map((c) => c.cls), expected: ['RADR_CHCO_S02_Observer'] },
            { name: 'Observer 판정', actual: obs.reason, expected: 'single-exact-name-and-size-candidate' },
            { name: 'Observer-Go 판정', actual: go.reason, expected: 'exact-name-but-size-differs' },
            { name: 'Observer-Go 규격 (UEX, 게임)', actual: [go.uexSize, go.candidates[0].size], expected: [1, 0] },
        ],
        tolerance: '정확히 (UEX 자료가 바뀌면 수가 달라진다 — manifest 의 조회 시각 기준)', sources: [SRC.ident, 'https://api.uexcorp.uk/2.0/items?id_category=83'],
    });
}
// 11. 대표 부품과 숨긴 중복 항목 --------------------------------------------------
{
    const h = ident.hiddenDuplicatesWithShops; const find = (name) => h.find((x) => x.uexName === name);
    const msd = find('MSD-543 Missile Rack'); const tempest = find('Tempest II Missile'); const arbor = find('Arbor MH1 Mining Laser');
    add({
        id: 'hidden-duplicate-representative', topic: '대표 부품과 숨긴 중복 항목', status: 'conflicting',
        inputs: { count: h.length, examples: [msd, tempest, arbor].map((x) => ({ uexItemId: x.uexItemId, uexName: x.uexName, hiddenCls: x.hidden.cls, hiddenUuid: x.hidden.uuid, representativeCls: x.representative.cls, representativeUuid: x.representative.uuid, shops: x.shops })) },
        steps: ['UEX 의 UUID 가 사이트에서 숨긴 중복 항목을 가리킨다', '대표 부품은 자기 UUID 로 된 UEX 기록이 없다 → 대표 부품에는 판매처가 안 보인다', '숨긴 항목의 판매 기록을 대표 부품(alias)으로 옮겨 보여야 한다'],
        checks: [
            { name: '해당 건수', actual: h.length, expected: 11, tolerance: 0 },
            { name: '대표 부품이 자기 UEX 기록을 가진 건수', actual: h.filter((x) => x.representativeHasOwnUexRecord).length, expected: 0, tolerance: 0 },
            { name: 'MSD-543 대표', actual: [msd.hidden.cls, msd.representative.cls, msd.shops], expected: ['MRCK_S05_BEHR_Quad_S03_a', 'MRCK_S05_BEHR_Quad_S03', 22] },
            { name: 'Tempest II 대표', actual: [tempest.hidden.cls, tempest.representative.cls], expected: ['MISL_S02_CS_FSKI_Tempest_CitCon', 'MISL_S02_CS_FSKI_Tempest'] },
            { name: 'Arbor MH1 대표', actual: [arbor.hidden.cls, arbor.representative.cls], expected: ['Mining_Laser_MPUV_Arm', 'Mining_Laser_GRIN_Arbor_S1'] },
        ],
        tolerance: '정확히', sources: [SRC.ident, SRC.shops, 'scripts/loadout/build-loadout-data.mjs (대표 제품 정리)'],
    });
}
// 12. 같은 이름의 다른 규격 · 도색 변종 -------------------------------------------
{
    const groups = ident.sameNameGroups; const main = groups.find((g) => g.name === 'Main Powerplant'); const paint = ident.paintVariants.find((p) => p.cls === 'APAR_BallisticScatterGun_S1_Shark');
    const shared = ident.uuidsSharedBySeveralUexItems.find((s) => s.game?.cls === 'APAR_BallisticScatterGun_S2');
    add({
        id: 'same-name-and-paint-variants', topic: '같은 이름의 다른 규격 및 도색 변종', status: 'verified',
        inputs: { sameNameGroups: groups.length, paintVariants: ident.paintVariants.length, shipSpecificVariants: ident.shipSpecificVariants.length, examples: { sameName: main, paint, sharedUuid: shared } },
        steps: ['"Main Powerplant": 이름은 같지만 함선(리클레이머·이드리스·벵갈)마다 다른 S4 발전기 → 이름으로 묶으면 안 됨', 'APAR_BallisticScatterGun_S1_Shark: 클래스명 끝의 _Shark 로 기본형(APAR_BallisticScatterGun_S1)의 도색 변종임을 알 수 있다', 'UEX "Hellion Scattergun Sharkmouth Edition" 은 기본형 Hellion(S2)의 UUID 를 같이 쓴다 → 도색판 판매 기록이 기본형에 붙을 수 있다'],
        checks: [
            { name: 'Main Powerplant 묶음 종류', actual: main.kind, expected: 'same-name-different-stats' },
            { name: 'Main Powerplant 구성원 수', actual: main.members.length, expected: 3, tolerance: 0 },
            { name: '도색 변종의 기본형', actual: paint.baseCls, expected: 'APAR_BallisticScatterGun_S1' },
            { name: '도색 변종 수', actual: ident.paintVariants.length, expected: 12, tolerance: 0 },
            { name: 'UUID 를 함께 쓰는 UEX 품목', actual: shared.uexItems.map((u) => u.uexName).sort(), expected: ['Hellion Scattergun', 'Hellion Scattergun Sharkmouth Edition'] },
        ],
        tolerance: '정확히', sources: [SRC.ident],
    });
}

// 13. 전력 구간(계단식) ----------------------------------------------------------
{
    const sh = Object.values(power.items).find((x) => x.type === 'Shield' && x.resource.states[0]?.powerRanges?.high?.start === 4 && x.resource.states[0].powerRanges.low.start === 1 && x.resource.states[0].powerRanges.medium.start === 3);
    const state = sh.resource.states[0]; const draw = state.deltas.find((d) => d.consumption?.resource === 'Power');
    const at = (u) => calc.powerRangeModifier(state, u);
    add({
        id: 'power-range-steps-shield', topic: '전력 배분에 따른 성능 (선형이 아님)', status: 'conflicting',
        inputs: { uuid: sh.uuid, cls: sh.cls, powerDrawUnits: draw.consumption.value, minimumConsumptionFraction: draw.minimumConsumptionFraction, powerRanges: state.powerRanges },
        steps: ['powerRanges: low 0.7 (1칸부터), medium 0.85 (3칸부터), high 1 (4칸부터)', '1칸 → 0.7, 2칸 → 0.7, 3칸 → 0.85, 4칸 → 1', '절반(2칸)을 배정해도 성능 계수는 0.5 가 아니라 0.7', '최소 요구(요구량 × minimumConsumptionFraction) 미만이면 꺼진다'],
        checks: [
            { name: '1칸 계수', actual: at(1).modifier, expected: 0.7, tolerance: 0 },
            { name: '2칸 계수', actual: at(2).modifier, expected: 0.7, tolerance: 0 },
            { name: '3칸 계수', actual: at(3).modifier, expected: 0.85, tolerance: 0 },
            { name: '4칸 계수', actual: at(4).modifier, expected: 1, tolerance: 0 },
            { name: '0칸이면 꺼짐', actual: at(0).online, expected: false },
        ],
        tolerance: '정확히', sources: [SRC.power, `EntityClassDefinition.${sh.cls} → ItemResourceComponentParams.states[Online].powerRanges`],
        open: '계수가 곱해지는 대상(실드 재생량·최대 실드량 등)과 구간 사이 보간 여부는 자료에 없다. 게임 안에서 칸 수별 재생량을 재면 확정된다.',
    });
}

// 사이트 계산기와 기준 계산의 전수 비교 (무기).
const siteComparison = [];
for (const [id, g] of Object.entries(weapons.guns)) {
    const d = g.derived; if (!d || d.burstDps === null || !items[id]) continue;
    const s = site.weaponSustain(items[id]); const b = site.weaponStats(items[id]);
    const rel = (x, y) => Math.abs(x - y) / Math.max(1, Math.abs(y));
    if (rel(b.dps, d.burstDps) > 0.005 || rel(s.dps, d.sustained.reference) > 0.005) {
        const cause = g.simplifiedHeat?.temperatureAfterOverheatFix > 0 ? '사이트가 첫 주기부터 temperatureAfterOverheatFix 를 시작 온도로 씀' : d.capacitor?.neverEmpties ? '사이트가 발 사이 충전을 반영하지 않음' : '미분류';
        siteComparison.push({ uuid: id, cls: g.cls, name: g.name, kind: d.mode.kind, siteBurst: Number(b.dps.toFixed(2)), referenceBurst: d.burstDps, siteSustained: Number(s.dps.toFixed(2)), referenceSustained: d.sustained.reference, cause });
    }
}
const compared = Object.values(weapons.guns).filter((g) => g.derived && g.derived.burstDps !== null).length;
writeData('validation-cases.json', {
    meta: { ...weapons.meta, validatedAt: new Date().toISOString(), cases: cases.length, checks: cases.reduce((n, c) => n + c.checks.length, 0), failedChecks: failed, note: 'status 는 사례의 근거 상태다: verified = 원본 값과 계산이 한 가지로 정해짐, conflicting = 해석이 둘 이상이라 값이 갈림, unavailable = 자료만으로 확정 불가. pass 는 "추출값 + 기준 계산이 손계산 예상값을 재현했는가"이다.' },
    cases,
    siteCalculatorComparison: { compared, differing: siteComparison.length, threshold: '0.5%', rows: siteComparison },
});
console.log(`${cases.length} cases, ${cases.reduce((n, c) => n + c.checks.length, 0)} checks, ${failed} failed; site vs reference: ${siteComparison.length}/${compared} differ`);
process.exit(failed ? 1 : 0);
