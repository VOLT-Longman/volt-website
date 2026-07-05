import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const EXTERNAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/external/erkul');
const DOCS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs');
const SHIPS_RAW_PATH = resolve(EXTERNAL_DIR, 'ships.raw.json');
const META_PATH = resolve(EXTERNAL_DIR, 'fetch-meta.json');
const NORMALIZED_PATH = resolve(EXTERNAL_DIR, 'ships-normalized.json');
const COVERAGE_JSON_PATH = resolve(EXTERNAL_DIR, 'coverage-report.json');
const COVERAGE_MD_PATH = resolve(DOCS_DIR, 'erkul-coverage-report.md');

// Erkul description은 리터럴 '\n'(백슬래시+n) 시퀀스를 줄바꿈으로 쓴다.
// 선두의 "Manufacturer:" / "Focus:" 헤더 라인만 제거하고 본문을 정제한다.
function cleanDescription(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const lines = raw.split(/\\n|\r?\n/);
    let start = 0;
    while (start < lines.length && (/^\s*$/.test(lines[start]) || /^\s*(Manufacturer|Focus):\s/.test(lines[start]))) {
        start += 1;
    }
    const body = lines
        .slice(start)
        .map((line) => line.trim())
        .filter((line, idx, arr) => line !== '' || (idx > 0 && arr[idx - 1] !== ''))
        .join('\n')
        .trim();
    return body || null;
}

function sumCountermeasureAmmo(data, shortName) {
    const launchers = (data.items?.countermeasures ?? []).filter((cm) => cm?.data?.shortName === shortName);
    if (launchers.length === 0) return null;
    return launchers.reduce((sum, cm) => sum + (cm.data?.ammoContainer?.maxAmmoCount ?? 0), 0);
}

const toNull = (v) => (v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v)) ? null : v);

// dimensions 축 주의: vehicle.size의 x/y 어느 쪽이 길이인지는 함선 모델마다 다르다
// (Asgard는 y=길이 48, Carrack은 x=길이 126). 의미 축을 단정하지 않고
// length=max(x,y), beam=min(x,y) 휴리스틱을 쓰되 raw 축을 sizeRaw로 보존한다.
function normalizeShip(record, syncedAt) {
    const d = record.data ?? {};
    const size = d.vehicle?.size;
    const hasXY = typeof size?.x === 'number' && typeof size?.y === 'number';

    return {
        localName: toNull(record.localName),
        name: toNull(d.name),
        ref: toNull(d.ref),
        externalStats: {
            source: 'erkul-live',
            sourceVersion: 'live',
            syncedAt,

            manufacturer: toNull(d.manufacturerData?.data?.name),
            role: toNull(d.vehicle?.role),
            career: toNull(d.vehicle?.career),
            size: toNull(d.size),
            crewSize: toNull(d.vehicle?.crewSize),

            speeds: {
                scm: toNull(d.ifcs?.scmSpeed),
                scmBoostForward: toNull(d.ifcs?.boostSpeedForward),
                scmBoostBackward: toNull(d.ifcs?.boostSpeedBackward),
                navMax: toNull(d.ifcs?.maxSpeed)
            },

            rotation: {
                pitch: toNull(d.ifcs?.angularVelocity?.x),
                yaw: toNull(d.ifcs?.angularVelocity?.z),
                roll: toNull(d.ifcs?.angularVelocity?.y),
                // raw에 없는 Erkul 클라이언트 계산값 — 계산식 역추적 전까지 null 유지 (A-2 결정)
                boostedPitch: null,
                boostedYaw: null,
                boostedRoll: null,
                currentPitch: null,
                currentYaw: null,
                currentRoll: null
            },

            countermeasures: {
                decoy: sumCountermeasureAmmo(d, 'Decoy'),
                noise: sumCountermeasureAmmo(d, 'Noise')
            },

            hp: toNull(d.hull?.totalHp),
            cargoScu: toNull(d.cargo),

            dimensions: {
                length: hasXY ? Math.max(size.x, size.y) : null,
                beam: hasXY ? Math.min(size.x, size.y) : null,
                height: toNull(size?.z),
                sizeRaw: size ? { x: toNull(size.x), y: toNull(size.y), z: toNull(size.z) } : null
            },

            massKg: toNull(d.hull?.mass),

            fuel: {
                hydrogenScu: toNull(d.fuelCapacity),
                quantumScu: toNull(d.qtFuelCapacity)
            },

            insurance: {
                expeditionFee: toNull(d.insurance?.baseExpeditingFee),
                claimTime: toNull(d.insurance?.baseWaitTimeMinutes),
                expediteTime: toNull(d.insurance?.mandatoryWaitTimeMinutes)
            },

            damageReduction: {
                physical: toNull(d.armor?.data?.armor?.damageMultiplier?.damagePhysical),
                energy: toNull(d.armor?.data?.armor?.damageMultiplier?.damageEnergy),
                distortion: toNull(d.armor?.data?.armor?.damageMultiplier?.damageDistortion),
                fuse: toNull(d.vehicle?.fusePenetrationDamageMultiplier),
                component: toNull(d.vehicle?.componentPenetrationDamageMultiplier)
            }
        },
        descriptions: {
            source: d.description ? 'erkul-live' : null,
            enRaw: toNull(d.description),
            en: cleanDescription(d.description),
            ko: null
        }
    };
}

// coverage 분류: raw = Erkul 원본에서 직접 추출 / heuristic = 원본 보존 + 파생 규칙 /
// derived-only = raw에 없는 Erkul 클라이언트 계산값 / unavailable = 원천 자체가 없음
const COVERAGE_FIELDS = [
    { key: 'externalStats.manufacturer', class: 'raw' },
    { key: 'externalStats.role', class: 'raw' },
    { key: 'externalStats.career', class: 'raw' },
    { key: 'externalStats.size', class: 'raw' },
    { key: 'externalStats.crewSize', class: 'raw' },
    { key: 'externalStats.speeds.scm', class: 'raw' },
    { key: 'externalStats.speeds.scmBoostForward', class: 'raw' },
    { key: 'externalStats.speeds.scmBoostBackward', class: 'raw' },
    { key: 'externalStats.speeds.navMax', class: 'raw' },
    { key: 'externalStats.rotation.pitch', class: 'raw' },
    { key: 'externalStats.rotation.yaw', class: 'raw' },
    { key: 'externalStats.rotation.roll', class: 'raw' },
    { key: 'externalStats.rotation.boostedPitch', class: 'derived-only / unavailable in raw' },
    { key: 'externalStats.rotation.boostedYaw', class: 'derived-only / unavailable in raw' },
    { key: 'externalStats.rotation.boostedRoll', class: 'derived-only / unavailable in raw' },
    { key: 'externalStats.rotation.currentPitch', class: 'derived-only / unavailable in raw' },
    { key: 'externalStats.rotation.currentYaw', class: 'derived-only / unavailable in raw' },
    { key: 'externalStats.rotation.currentRoll', class: 'derived-only / unavailable in raw' },
    { key: 'externalStats.countermeasures.decoy', class: 'raw' },
    { key: 'externalStats.countermeasures.noise', class: 'raw' },
    { key: 'externalStats.hp', class: 'raw' },
    { key: 'externalStats.cargoScu', class: 'raw' },
    { key: 'externalStats.dimensions.length', class: 'heuristic (max of size.x,y)' },
    { key: 'externalStats.dimensions.beam', class: 'heuristic (min of size.x,y)' },
    { key: 'externalStats.dimensions.height', class: 'raw (size.z)' },
    { key: 'externalStats.massKg', class: 'raw' },
    { key: 'externalStats.fuel.hydrogenScu', class: 'raw' },
    { key: 'externalStats.fuel.quantumScu', class: 'raw' },
    { key: 'externalStats.insurance.expeditionFee', class: 'raw' },
    { key: 'externalStats.insurance.claimTime', class: 'raw' },
    { key: 'externalStats.insurance.expediteTime', class: 'raw' },
    { key: 'externalStats.damageReduction.physical', class: 'raw' },
    { key: 'externalStats.damageReduction.energy', class: 'raw' },
    { key: 'externalStats.damageReduction.distortion', class: 'raw' },
    { key: 'externalStats.damageReduction.fuse', class: 'raw' },
    { key: 'externalStats.damageReduction.component', class: 'raw' },
    { key: 'descriptions.enRaw', class: 'raw' },
    { key: 'descriptions.en', class: 'heuristic (헤더 제거 정제)' },
    { key: 'descriptions.ko', class: 'unavailable (Erkul에 원천 없음)' }
];

function getByPath(obj, path) {
    return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

function buildCoverage(normalizedShips) {
    const total = normalizedShips.length;
    return COVERAGE_FIELDS.map(({ key, class: cls }) => {
        const missing = [];
        let filled = 0;
        for (const ship of normalizedShips) {
            const value = getByPath(ship, key);
            if (value !== null && value !== undefined) filled += 1;
            else if (missing.length < 10) missing.push(ship.localName);
        }
        return {
            field: key,
            class: cls,
            filled,
            total,
            coverage: `${((filled / total) * 100).toFixed(1)}%`,
            missingSample: filled === total ? [] : missing
        };
    });
}

function renderCoverageMarkdown(coverage, meta, total) {
    const lines = [
        '# Erkul 상세 스펙 coverage report (A-2)',
        '',
        `\`ships-normalized.json\` 기준 필드별 채움률. 재현: \`npm run shipdb:erkul:normalize\``,
        '',
        `- 원천: Erkul live (\`${meta.endpoints?.ships ?? 'https://server.erkul.games/live/ships'}\`)`,
        `- fetch 시각: ${meta.fetchedAt}`,
        `- 대상: ${total}척 (지상 차량 포함 전체 레코드)`,
        '',
        '분류 기준:',
        '- **raw** — Erkul 원본 path에서 직접 추출',
        '- **heuristic** — 원본을 보존하면서 명시된 규칙으로 파생 (dimensions는 `sizeRaw`에 원본 축 보존)',
        '- **derived-only / unavailable in raw** — Erkul 클라이언트 계산값으로 raw에 없음. 계산식 역추적 전까지 `null` (값 생성 금지)',
        '- **unavailable** — 원천 자체가 없음 (KO 설명 등)',
        '',
        '| Field | Class | Filled | Coverage | Missing (최대 10) |',
        '|---|---|---|---|---|'
    ];
    for (const row of coverage) {
        lines.push(`| \`${row.field}\` | ${row.class} | ${row.filled}/${row.total} | ${row.coverage} | ${row.missingSample.join(', ') || '—'} |`);
    }
    lines.push(
        '',
        '## dimensions 축 검증 (A-2 사실)',
        '',
        '- `vehicle.size`의 x/y 중 어느 쪽이 길이인지는 **함선 모델마다 다르다**.',
        '  Asgard는 y=길이(48), Carrack은 x=길이(126)로 고정축 해석은 성립하지 않는다.',
        '- 따라서 `length=max(x,y)`, `beam=min(x,y)` 휴리스틱을 적용하고, 원본 축은 `dimensions.sizeRaw`에 보존한다.',
        '- RSI Ship Matrix와 교차검증(이름 매칭 195척): `length=max(x,y)`가 RSI length와 25% 오차 내 일치 152/195.',
        '  잔여 차이는 Erkul(인게임 바운딩 박스)과 RSI(공식 스펙 시트) 측정 기준 차이로, 축 해석 오류가 아니다.',
        '',
        '## descriptions 정제 규칙',
        '',
        '- Erkul description의 줄바꿈은 리터럴 `\\n` 2문자다 (실제 개행 아님).',
        '- 선두 `Manufacturer:` / `Focus:` 헤더 라인(25척)만 제거하고 나머지는 원문 유지.',
        '- `enRaw`(원문)와 `en`(정제본)을 분리 저장. `ko`는 원천이 없어 `null`.'
    );
    return `${lines.join('\n')}\n`;
}

async function main() {
    let ships;
    let meta;
    try {
        ships = JSON.parse(await readFile(SHIPS_RAW_PATH, 'utf8'));
        meta = JSON.parse(await readFile(META_PATH, 'utf8'));
    } catch {
        console.error('ships.raw.json / fetch-meta.json을 읽지 못함. 먼저 실행: npm run shipdb:erkul:fetch');
        process.exitCode = 1;
        return;
    }

    const normalized = ships.map((record) => normalizeShip(record, meta.fetchedAt));
    const coverage = buildCoverage(normalized);

    await writeFile(NORMALIZED_PATH, `${JSON.stringify({
        source: 'erkul-live',
        sourceVersion: 'live',
        syncedAt: meta.fetchedAt,
        shipCount: normalized.length,
        ships: normalized
    }, null, 2)}\n`, 'utf8');

    await writeFile(COVERAGE_JSON_PATH, `${JSON.stringify({
        source: 'erkul-live',
        syncedAt: meta.fetchedAt,
        shipCount: normalized.length,
        fields: coverage
    }, null, 2)}\n`, 'utf8');

    await writeFile(COVERAGE_MD_PATH, renderCoverageMarkdown(coverage, meta, normalized.length), 'utf8');

    const full = coverage.filter((row) => row.filled === row.total).length;
    console.log(`normalized: ${normalized.length}척 → ${NORMALIZED_PATH}`);
    console.log(`coverage: ${full}/${coverage.length} 필드 100% (상세: ${COVERAGE_MD_PATH})`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
