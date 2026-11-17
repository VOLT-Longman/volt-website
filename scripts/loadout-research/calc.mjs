// 조사용 기준 계산. 사이트 계산기(js/loadout-calc.js)와 따로 두고, 원본 값에서 한 단계씩 다시 계산한다.
// 게임 실행 코드에서만 정해지는 규칙(경계 조건 등)은 한 값으로 못박지 않고 variants 로 나란히 낸다.
const r = (n, d = 4) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(d)) : null);
const sum = (damage) => (damage ? Object.values(damage).reduce((n, v) => n + (v || 0), 0) : 0);

// 발사 방식 한 개를 계산에 쓰는 꼴로 푼다.
//   Sequence: 첫 항목의 동작을 쓰고, 항목 단위가 RPM 이면 그 값이 실제 연사 간격이다.
//   Charged : 안쪽 동작 + 충전 시간·재사용 대기.
export function resolveMode(mode) {
    if (!mode) return null;
    if (mode.sequence) {
        const entry = mode.sequence[0];
        const inner = resolveMode(entry?.action);
        if (!inner) return null;
        const out = { ...inner, sequenceEntries: mode.sequence.length };
        if (entry.unit === 'RPM' && entry.delay) { out.fireRate = entry.delay; out.fireRateSource = 'sequenceEntries[0].delay'; out.innerFireRate = inner.fireRate; }
        return out;
    }
    if (mode.type === 'FireCharged') {
        const inner = resolveMode(mode.inner) || {};
        return { ...inner, kind: 'charged', chargeTime: mode.chargeTime ?? null, overchargeTime: mode.overchargeTime ?? null, cooldownTime: mode.cooldownTime ?? null, maxChargeModifier: mode.maxChargeModifier || null };
    }
    if (mode.type === 'FireBeam') return { kind: 'beam', damagePerSecond: mode.damagePerSecond || null, fullDamageRange: mode.fullDamageRange ?? null, zeroDamageRange: mode.zeroDamageRange ?? null, heatPerSecond: mode.heatPerSecond ?? null };
    const kind = { FireSingle: 'single', FireRapid: 'rapid', FireBurst: 'burst' }[mode.type];
    if (!kind) return { kind: 'other', type: mode.type };
    return {
        kind, fireRate: mode.fireRate ?? null, fireRateSource: 'fireRate', heatPerShot: mode.heatPerShot ?? null,
        pellets: mode.launch?.pelletCount ?? null, damageMultiplier: mode.launch?.damageMultiplier ?? null, ammoCost: mode.launch?.ammoCost ?? null,
        shotCount: mode.shotCount ?? null, cooldownTime: mode.cooldownTime ?? null, spread: mode.launch?.spread || null,
        spinUpTime: mode.spinUpTime ?? null, spinDownTime: mode.spinDownTime ?? null,
    };
}

// 1발 피해: (직격 + 기폭 폭발) × 탄 수(산탄) × 피해 배수.
export function alphaOf(ammo, mode) {
    if (!ammo || !mode) return null;
    const direct = sum(ammo.damage); const blast = sum(ammo.detonation?.damage);
    const pellets = mode.pellets > 1 ? mode.pellets : 1;
    const mult = mode.damageMultiplier ?? 1;
    return { direct: r(direct), blast: r(blast), pellets, damageMultiplier: mult, total: r((direct + blast) * pellets * mult) };
}

// 초당 발사 수. 점사·충전식은 주기를 어떻게 세느냐에 따라 값이 갈린다.
export function fireCycle(mode) {
    if (!mode || !mode.fireRate) return null;
    const interval = 60 / mode.fireRate;
    if (mode.kind === 'burst' && mode.shotCount > 1) {
        const n = mode.shotCount; const cd = mode.cooldownTime || 0;
        return { interval: r(interval, 6), shotsPerSecond: r(n / ((n - 1) * interval + Math.max(cd, interval)), 6), variants: { rpmOnly: r(mode.fireRate / 60, 6), burstThenCooldown: r(n / ((n - 1) * interval + cd), 6), burstPlusIntervalAndCooldown: r(n / (n * interval + cd), 6) }, note: '점사: 사이트는 rpmOnly 를 쓴다. 점사 사이 대기(cooldownTime)를 넣으면 더 낮다.' };
    }
    if (mode.kind === 'charged') {
        const charge = mode.chargeTime || 0; const cd = mode.cooldownTime || 0;
        return { interval: r(interval, 6), shotsPerSecond: r(1 / (charge + cd + interval), 6), variants: { chargePlusCooldownPlusInterval: r(1 / (charge + cd + interval), 6), chargePlusCooldown: charge + cd > 0 ? r(1 / (charge + cd), 6) : null, chargeOnly: charge > 0 ? r(1 / charge, 6) : null }, note: '충전식: 충전·대기·발사 간격 중 무엇이 겹치는지는 자료에 없다.' };
    }
    return { interval: r(interval, 6), shotsPerSecond: r(mode.fireRate / 60, 6) };
}

// 실탄 과열 주기. heat: simplifiedHeatParams.
//   n번째 발 직후 온도 = n·열 − (n−1)·(발 사이 식는 양). 온도가 과열 한도에 닿는 첫 n 이 "과열까지 발사 수".
export function heatCycle({ fireRate, heatPerShot, heat, startTemperature = 0 }) {
    if (!fireRate || !heatPerShot || !heat?.overheatTemperature) return null;
    const interval = 60 / fireRate;
    const cooledBetween = Math.max(0, interval - (heat.timeTillCoolingStarts || 0)) * (heat.coolingPerSecond || 0);
    const net = heatPerShot - cooledBetween;
    const room = heat.overheatTemperature - startTemperature;
    if (!(net > 0)) return { overheats: false, interval: r(interval, 6), cooledBetweenShots: r(cooledBetween), netHeatPerShot: r(net) };
    const shots = Math.max(1, Math.ceil((room - heatPerShot) / net) + 1);
    const fix = heat.overheatFixTime || 0;
    // 과열이 풀린 뒤 남는 온도(temperatureAfterOverheatFix)에서 다시 시작하는 다음 주기.
    const after = heat.temperatureAfterOverheatFix || 0;
    const nextShots = Math.max(1, Math.ceil((heat.overheatTemperature - after - heatPerShot) / net) + 1);
    return {
        overheats: true, interval: r(interval, 6), cooledBetweenShots: r(cooledBetween), netHeatPerShot: r(net), shotsToOverheat: shots, shotsToOverheatAfterFix: nextShots,
        fireTime: { excludingLastInterval: r((shots - 1) * interval), includingLastInterval: r(shots * interval) }, overheatFixTime: fix,
        // 주기 = 사격 시간 + 멈춘 시간. 경계 조건 두 가지를 모두 낸다.
        cycle: { excludingLastInterval: r((shots - 1) * interval + Math.max(fix, interval)), includingLastInterval: r(shots * interval + fix) },
    };
}

// 에너지 무기의 축전 탄창. regen: weaponRegenConsumerParams.
export function regenCycle({ fireRate, regen, ammoCost = 1 }) {
    if (!fireRate || !regen?.maxAmmoLoad || !regen?.maxRegenPerSec) return null;
    const interval = 60 / fireRate;
    const load = regen.maxAmmoLoad; const perSec = regen.maxRegenPerSec; const delay = regen.regenerationCooldown || 0;
    const shots = Math.floor(load / (ammoCost || 1));
    // 발 사이 간격이 충전 지연보다 길면 쏘는 중에도 충전된다.
    const regenWhileFiring = Math.max(0, interval - delay) * perSec;
    const refill = delay + load / perSec;
    return {
        interval: r(interval, 6), shotsPerMagazine: shots, regenWhileFiringPerShot: r(regenWhileFiring), neverEmpties: regenWhileFiring >= (ammoCost || 1),
        emptyTime: { excludingLastInterval: r((shots - 1) * interval), includingLastInterval: r(shots * interval) }, refillTime: r(refill),
        cycle: { excludingLastInterval: r((shots - 1) * interval + refill), includingLastInterval: r(shots * interval + refill) },
        requested: { ammoLoad: regen.requestedAmmoLoad ?? null, regenPerSec: regen.requestedRegenPerSec ?? null, costPerBullet: regen.regenerationCostPerBullet ?? null, shotsIfRequestedLoadGranted: regen.requestedAmmoLoad && regen.regenerationCostPerBullet ? r(regen.requestedAmmoLoad / regen.regenerationCostPerBullet, 2) : null, shotsPerSecIfRequestedRegenGranted: regen.requestedRegenPerSec && regen.regenerationCostPerBullet ? r(regen.requestedRegenPerSec / regen.regenerationCostPerBullet, 4) : null },
    };
}

export function weaponDerived(weapon) {
    const mode = resolveMode(weapon.modes?.[0]);
    if (!mode) return null;
    if (mode.kind === 'beam') {
        const dps = sum(mode.damagePerSecond);
        return { mode, burstDps: r(dps), sustained: { limit: null, value: r(dps), variants: null }, range: mode.zeroDamageRange ?? null, rangeNote: '광선: zeroDamageRange 까지, fullDamageRange 부터 피해가 줄어든다.' };
    }
    const alpha = alphaOf(weapon.ammo, mode);
    const cycle = fireCycle(mode);
    if (!alpha || !cycle) return { mode, alpha, burstDps: null, sustained: null };
    const burst = alpha.total * cycle.shotsPerSecond;
    // 과열·축전 주기는 실제 발사 간격(점사·충전 주기 반영)으로 센다.
    const effectiveRate = cycle.shotsPerSecond * 60;
    const heat = heatCycle({ fireRate: effectiveRate, heatPerShot: mode.heatPerShot, heat: weapon.simplifiedHeat });
    const regen = regenCycle({ fireRate: effectiveRate, regen: weapon.regen, ammoCost: mode.ammoCost || 1 });
    const variants = [];
    if (heat?.overheats) for (const key of ['excludingLastInterval', 'includingLastInterval']) variants.push({ limit: 'heat', boundary: key, value: r(Math.min(burst, alpha.total * heat.shotsToOverheat / heat.cycle[key])) });
    // 개틀링: 회전 시작 시간(spinUpTime)만큼 주기마다 첫 발이 늦는다고 보면 조금 더 낮다.
    if (heat?.overheats && mode.spinUpTime > 0) variants.push({ limit: 'heat', boundary: 'excludingLastInterval+spinUpTime', value: r(Math.min(burst, alpha.total * heat.shotsToOverheat / (heat.cycle.excludingLastInterval + mode.spinUpTime))) });
    // 과열이 풀린 뒤에도 온도가 남는 무기(temperatureAfterOverheatFix > 0): 다 식을 때까지 기다렸다 쏘는 주기.
    if (heat?.overheats && weapon.simplifiedHeat?.temperatureAfterOverheatFix > 0 && weapon.simplifiedHeat.coolingPerSecond > 0) variants.push({ limit: 'heat', boundary: 'waitUntilFullyCooled', value: r(Math.min(burst, alpha.total * heat.shotsToOverheat / (heat.cycle.excludingLastInterval + weapon.simplifiedHeat.temperatureAfterOverheatFix / weapon.simplifiedHeat.coolingPerSecond))) }, { limit: 'heat', boundary: 'holdTriggerAfterFix', value: r(Math.min(burst, alpha.total * heat.shotsToOverheatAfterFix / ((heat.shotsToOverheatAfterFix - 1) * heat.interval + Math.max(heat.overheatFixTime, heat.interval)))) });
    if (regen && !regen.neverEmpties) for (const key of ['excludingLastInterval', 'includingLastInterval']) variants.push({ limit: 'capacitor', boundary: key, value: r(Math.min(burst, alpha.total * regen.shotsPerMagazine / regen.cycle[key])) });
    // 다른 해석: 쏘는 중에도 충전이 끊기지 않는다면, 탄창이 빈 뒤에는 충전 속도가 곧 연사 속도의 한도다.
    if (regen && !regen.neverEmpties) variants.push({ limit: 'capacitor', boundary: 'regenNotInterruptedByFiring', value: r(alpha.total * Math.min(cycle.shotsPerSecond, weapon.regen.maxRegenPerSec / (mode.ammoCost || 1))) });
    // 사이트가 지금 쓰는 조합: 과열은 마지막 간격 제외, 축전은 마지막 간격 포함.
    const site = [variants.find((v) => v.limit === 'heat' && v.boundary === 'excludingLastInterval'), variants.find((v) => v.limit === 'capacitor' && v.boundary === 'includingLastInterval')].filter(Boolean).sort((x, y) => x.value - y.value)[0];
    return {
        mode, alpha, fireCycle: cycle, burstDps: r(burst),
        heat, capacitor: regen,
        // reference: 과열은 0도에서 시작·마지막 간격 제외, 축전은 마지막 간격 포함, 발 사이 충전 반영.
        sustained: { reference: site ? site.value : r(burst), limit: site ? site.limit : null, variants: variants.length ? variants : null },
        range: weapon.ammo?.speed && weapon.ammo?.lifetime ? r(weapon.ammo.speed * weapon.ammo.lifetime, 1) : null,
        ammoSeconds: weapon.maxAmmoCount && cycle.shotsPerSecond ? r(weapon.maxAmmoCount / cycle.shotsPerSecond, 1) : null,
    };
}

// 추력 합 ÷ 질량. 축별 배율(IFCS)과 추진기 방향은 반영하지 않는 윗값이다.
export function flightDerived({ mass, thrustByType, controller }) {
    if (!mass || !thrustByType) return null;
    const accel = (n) => (n ? r(n / mass, 3) : null);
    return {
        mainAccel: accel(thrustByType.Main), retroAccel: accel(thrustByType.Retro), maneuverAccelAllThrusters: accel(thrustByType.Maneuver),
        mainAccelG: thrustByType.Main ? r(thrustByType.Main / mass / 9.80665, 3) : null,
        boostDuration: controller?.afterburner?.capacitorMax && controller.afterburner.capacitorAfterburnerIdleCost ? r(controller.afterburner.capacitorMax / controller.afterburner.capacitorAfterburnerIdleCost, 2) : null,
        boostRecharge: controller?.afterburner?.capacitorMax && controller.afterburner.capacitorRegenPerSec ? r((controller.afterburner.capacitorRegenDelayAfterUse || 0) + controller.afterburner.capacitorMax / controller.afterburner.capacitorRegenPerSec, 2) : null,
        note: 'mainAccel = Main 추진기 thrustCapacity 합 ÷ 질량. 부스트 지속 = capacitorMax ÷ capacitorAfterburnerIdleCost (직선·회전 추가 비용 제외).',
    };
}

// 퀀텀 항속(Gm) = 연료 탱크(SCU) ÷ quantumFuelRequirement.
export const quantumRange = (capacityScu, requirement) => (capacityScu > 0 && requirement > 0 ? r(capacityScu / requirement, 3) : null);

// 퀀텀 이동 시간. 가속 단계의 전환 조건이 자료에 없어 세 모형을 나란히 낸다.
//   constantA2 : 사이트 방식 — stageTwoAccelRate 로 가속·감속하는 사다리꼴.
//   constantA1 : stageOneAccelRate 만 쓰는 사다리꼴 (느린 쪽 한계).
//   cruiseOnly : 가속 없이 최고 속도 (빠른 쪽 한계).
export function quantumTime({ distanceM, driveSpeed, stageOneAccelRate, stageTwoAccelRate, spoolUpTime = 0 }) {
    if (!(distanceM > 0) || !(driveSpeed > 0)) return null;
    const trapezoid = (accel) => {
        if (!(accel > 0)) return null;
        const ramp = driveSpeed * driveSpeed / accel; // 가속 + 감속 구간 거리
        const reachesTopSpeed = distanceM >= ramp;
        const travel = reachesTopSpeed ? distanceM / driveSpeed + driveSpeed / accel : 2 * Math.sqrt(distanceM / accel);
        return { travel: r(travel, 2), reachesTopSpeed, peakSpeed: r(reachesTopSpeed ? driveSpeed : Math.sqrt(distanceM * accel), 0), rampDistanceM: r(ramp, 0) };
    };
    return { spoolUpTime, constantA2: trapezoid(stageTwoAccelRate), constantA1: trapezoid(stageOneAccelRate), cruiseOnly: { travel: r(distanceM / driveSpeed, 2) } };
}

// 전력 배분 → 성능 계수. powerRanges 의 start 는 "배정한 전력 칸 수"의 문턱이다 (비율이 아니다).
//   assignedUnits: 그 장비에 배정한 전력 칸 수. 최소 요구(요구량 × minimumConsumptionFraction) 미만이면 꺼진다.
//   계수는 계단식이다: 배정 칸 수가 start 이상인 구간 가운데 start 가 가장 큰 구간의 modifier.
//   이 계수가 어떤 성능(실드 재생, 냉각량 등)에 곱해지는지는 자료에 없다 — 해석이다.
export function powerRangeModifier(state, assignedUnits) {
    const draw = (state?.deltas || []).find((d) => d.consumption?.resource === 'Power');
    if (!draw) return null;
    const max = draw.consumption.value; const min = max * (draw.minimumConsumptionFraction ?? 0);
    if (assignedUnits < min - 1e-9) return { online: false, modifier: 0, range: null, minimumUnits: r(min, 3), maximumUnits: max };
    const ranges = state.powerRanges;
    if (!ranges) return { online: true, modifier: 1, range: null, minimumUnits: r(min, 3), maximumUnits: max };
    const order = ['low', 'medium', 'high'].map((k) => ({ k, ...ranges[k] })).filter((x) => typeof x.start === 'number').sort((x, y) => y.start - x.start);
    const hit = order.find((x) => assignedUnits >= x.start) || order[order.length - 1];
    return { online: true, modifier: hit?.modifier ?? null, range: hit?.k ?? null, minimumUnits: r(min, 3), maximumUnits: max };
}
