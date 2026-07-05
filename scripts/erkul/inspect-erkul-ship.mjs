import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const EXTERNAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/external/erkul');
const SHIPS_RAW_PATH = resolve(EXTERNAL_DIR, 'ships.raw.json');

// 사용자 제공 Asgard 대표값 (2026-07 기준 수기 샘플). Erkul live가 더 최신일 수 있으므로
// 불일치는 실패가 아니라 "차이 보고" 대상이다.
const USER_SAMPLE_ASGARD = {
    manufacturer: 'Anvil Aerospace',
    role: 'Dropship',
    career: 'Combat',
    size: 'S4',
    crewSize: 1,
    scmSpeed: 203,
    scmBoostForward: 425,
    scmBoostBackward: 240,
    navMaxSpeed: 1075,
    pitch: 33,
    yaw: 28,
    roll: 95,
    hp: 77000,
    cargoScu: 180,
    'dimensions.beam': 38,
    'dimensions.length': 48,
    'dimensions.height': 12,
    massKg: 610246,
    hydrogenCapacityScu: 97.5,
    quantumFuelCapacityScu: 1.85,
    expeditionFee: 9430,
    claimTime: '00:17:00',
    expediteTime: '00:04:15'
};

function minutesToHms(minutes) {
    if (typeof minutes !== 'number' || Number.isNaN(minutes)) return null;
    const totalSeconds = Math.round(minutes * 60);
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function sumCountermeasureAmmo(data, shortName) {
    const launchers = (data.items?.countermeasures ?? []).filter((cm) => cm?.data?.shortName === shortName);
    if (launchers.length === 0) return null;
    return launchers.reduce((sum, cm) => sum + (cm.data?.ammoContainer?.maxAmmoCount ?? 0), 0);
}

// 필드별 Erkul JSON path 정의. extract가 undefined/null을 반환하면 "not found"로 기록한다.
// path 표기는 ship.data 기준 상대 경로.
const FIELD_MAP = [
    { field: 'manufacturer', path: 'manufacturerData.data.name', extract: (d) => d.manufacturerData?.data?.name },
    { field: 'role', path: 'vehicle.role', extract: (d) => d.vehicle?.role },
    { field: 'career', path: 'vehicle.career', extract: (d) => d.vehicle?.career },
    { field: 'size', path: 'size', extract: (d) => d.size, notes: 'Erkul은 숫자(4), 사용자 샘플은 표기형(S4)' },
    { field: 'crewSize', path: 'vehicle.crewSize', extract: (d) => d.vehicle?.crewSize },
    { field: 'scmSpeed', path: 'ifcs.scmSpeed', extract: (d) => d.ifcs?.scmSpeed },
    { field: 'scmBoostForward', path: 'ifcs.boostSpeedForward', extract: (d) => d.ifcs?.boostSpeedForward },
    { field: 'scmBoostBackward', path: 'ifcs.boostSpeedBackward', extract: (d) => d.ifcs?.boostSpeedBackward },
    { field: 'navMaxSpeed', path: 'ifcs.maxSpeed', extract: (d) => d.ifcs?.maxSpeed },
    { field: 'pitch', path: 'ifcs.angularVelocity.x', extract: (d) => d.ifcs?.angularVelocity?.x, notes: 'Erkul UI는 반올림 표시 (32.5 → 33)' },
    { field: 'yaw', path: 'ifcs.angularVelocity.z', extract: (d) => d.ifcs?.angularVelocity?.z, notes: 'Erkul UI는 반올림 표시 (27.5 → 28)' },
    { field: 'roll', path: 'ifcs.angularVelocity.y', extract: (d) => d.ifcs?.angularVelocity?.y },
    { field: 'boostedPitch', path: null, extract: () => undefined, notes: 'raw에 없음 — Erkul 클라이언트 계산값(afterburner 배율)' },
    { field: 'boostedYaw', path: null, extract: () => undefined, notes: 'raw에 없음 — Erkul 클라이언트 계산값' },
    { field: 'boostedRoll', path: null, extract: () => undefined, notes: 'raw에 없음 — Erkul 클라이언트 계산값' },
    { field: 'currentPitch', path: null, extract: () => undefined, notes: 'raw에 없음 — 로드아웃 반영 계산값' },
    { field: 'currentYaw', path: null, extract: () => undefined, notes: 'raw에 없음 — 로드아웃 반영 계산값' },
    { field: 'currentRoll', path: null, extract: () => undefined, notes: 'raw에 없음 — 로드아웃 반영 계산값' },
    { field: 'decoy', path: "sum(items.countermeasures[shortName='Decoy'].data.ammoContainer.maxAmmoCount)", extract: (d) => sumCountermeasureAmmo(d, 'Decoy'), notes: '런처 4기 × 48발 합산' },
    { field: 'noise', path: "sum(items.countermeasures[shortName='Noise'].data.ammoContainer.maxAmmoCount)", extract: (d) => sumCountermeasureAmmo(d, 'Noise'), notes: '런처 4기 × 5발 합산' },
    { field: 'hp', path: 'hull.totalHp', extract: (d) => d.hull?.totalHp },
    { field: 'cargoScu', path: 'cargo', extract: (d) => d.cargo },
    { field: 'dimensions.length', path: 'vehicle.size.y', extract: (d) => d.vehicle?.size?.y, notes: 'CryEngine 축 관례 해석(y=전방). A-2에서 다함선 교차검증 필요' },
    { field: 'dimensions.beam', path: 'vehicle.size.x', extract: (d) => d.vehicle?.size?.x, notes: 'CryEngine 축 관례 해석(x=측면). A-2에서 다함선 교차검증 필요' },
    { field: 'dimensions.height', path: 'vehicle.size.z', extract: (d) => d.vehicle?.size?.z, notes: 'CryEngine 축 관례 해석(z=상하). A-2에서 다함선 교차검증 필요' },
    { field: 'massKg', path: 'hull.mass', extract: (d) => d.hull?.mass },
    { field: 'hydrogenCapacityScu', path: 'fuelCapacity', extract: (d) => d.fuelCapacity },
    { field: 'quantumFuelCapacityScu', path: 'qtFuelCapacity', extract: (d) => d.qtFuelCapacity },
    { field: 'expeditionFee', path: 'insurance.baseExpeditingFee', extract: (d) => d.insurance?.baseExpeditingFee },
    { field: 'claimTime', path: 'insurance.baseWaitTimeMinutes', extract: (d) => minutesToHms(d.insurance?.baseWaitTimeMinutes), notes: '분 단위 원본(17)을 HH:MM:SS로 변환' },
    { field: 'expediteTime', path: 'insurance.mandatoryWaitTimeMinutes', extract: (d) => minutesToHms(d.insurance?.mandatoryWaitTimeMinutes), notes: '분 단위 원본(4.25)을 HH:MM:SS로 변환' },
    { field: 'damageReduction.physical', path: 'armor.data.armor.damageMultiplier.damagePhysical', extract: (d) => d.armor?.data?.armor?.damageMultiplier?.damagePhysical, notes: '배율 원본(0.7)=피해 30% 감소' },
    { field: 'damageReduction.energy', path: 'armor.data.armor.damageMultiplier.damageEnergy', extract: (d) => d.armor?.data?.armor?.damageMultiplier?.damageEnergy, notes: '배율 원본(0.5)=피해 50% 감소' },
    { field: 'damageReduction.distortion', path: 'armor.data.armor.damageMultiplier.damageDistortion', extract: (d) => d.armor?.data?.armor?.damageMultiplier?.damageDistortion, notes: '배율 원본(1)=감소 없음' },
    { field: 'damageReduction.fuse', path: 'vehicle.fusePenetrationDamageMultiplier', extract: (d) => d.vehicle?.fusePenetrationDamageMultiplier },
    { field: 'damageReduction.component', path: 'vehicle.componentPenetrationDamageMultiplier', extract: (d) => d.vehicle?.componentPenetrationDamageMultiplier },
    { field: 'descriptionEn', path: 'description', extract: (d) => d.description, notes: '영어 설명 존재. Manufacturer/Focus 헤더 라인 포함' },
    { field: 'descriptionKo', path: null, extract: () => undefined, notes: 'Erkul 페이로드 전체에 한국어 없음 — 별도 원천 필요 (global.ini 등)' }
];

function compareValues(field, erkulValue, userValue) {
    if (erkulValue === undefined || erkulValue === null) return 'not found';
    if (userValue === undefined) return 'user sample 없음';
    if (erkulValue === userValue) return '일치';
    if (typeof erkulValue === 'number' && typeof userValue === 'number') {
        if (Math.round(erkulValue) === userValue || Math.abs(erkulValue - userValue) < 1) return '일치(반올림)';
    }
    if (field === 'size' && `S${erkulValue}` === userValue) return '일치(표기 변환)';
    return '불일치';
}

async function main() {
    const query = (process.argv[2] || '').toLowerCase();
    if (!query) {
        console.error('사용법: node scripts/erkul/inspect-erkul-ship.mjs <함선명 일부, 예: asgard>');
        process.exitCode = 1;
        return;
    }

    let ships;
    try {
        ships = JSON.parse(await readFile(SHIPS_RAW_PATH, 'utf8'));
    } catch {
        console.error(`ships.raw.json을 읽지 못함: ${SHIPS_RAW_PATH}`);
        console.error('먼저 실행: node scripts/erkul/fetch-erkul-live.mjs');
        process.exitCode = 1;
        return;
    }

    const candidates = ships.filter((s) => {
        const localName = String(s.localName || '').toLowerCase();
        const name = String(s.data?.name || '').toLowerCase();
        return localName.includes(query) || name.includes(query);
    });

    if (candidates.length === 0) {
        console.error(`"${query}" 후보를 찾지 못함 (ships: ${ships.length})`);
        process.exitCode = 1;
        return;
    }

    console.log(`후보 ${candidates.length}건:`);
    for (const c of candidates) {
        console.log(`- localName: ${c.localName} | data.name: ${c.data?.name} | manufacturer: ${c.data?.manufacturerData?.data?.name} | ref: ${c.data?.ref}`);
    }

    const ship = candidates[0];
    const data = ship.data;
    const userSample = query === 'asgard' ? USER_SAMPLE_ASGARD : {};

    const fields = {};
    for (const { field, path, extract, notes } of FIELD_MAP) {
        const value = extract(data);
        const status = compareValues(field, value, userSample[field]);
        fields[field] = {
            erkulPath: path ?? 'not found',
            value: value === undefined ? 'not found' : value,
            userSample: userSample[field] ?? null,
            status,
            ...(notes ? { notes } : {})
        };
    }

    console.log(`\n=== ${ship.localName} 필드 추적 결과 ===`);
    for (const [field, info] of Object.entries(fields)) {
        const shown = field === 'descriptionEn' && typeof info.value === 'string'
            ? `${info.value.slice(0, 60)}...`
            : info.value;
        console.log(`${field.padEnd(28)} | ${String(info.erkulPath).padEnd(55)} | ${String(shown).padEnd(20)} | ${info.status}`);
    }

    const rawPath = resolve(EXTERNAL_DIR, `${query}.raw.json`);
    const samplePath = resolve(EXTERNAL_DIR, `${query}-field-sample.json`);
    await writeFile(rawPath, `${JSON.stringify(ship, null, 2)}\n`, 'utf8');
    await writeFile(samplePath, `${JSON.stringify({
        source: 'erkul-live',
        endpoint: 'https://server.erkul.games/live/ships',
        localName: ship.localName,
        name: data?.name,
        ref: data?.ref,
        inspectedAt: new Date().toISOString(),
        fields
    }, null, 2)}\n`, 'utf8');

    console.log(`\nraw 저장: ${rawPath}`);
    console.log(`field sample 저장: ${samplePath}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
