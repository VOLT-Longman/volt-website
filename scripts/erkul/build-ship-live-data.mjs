import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mergeMappedMarketRows, normalizeErkulMarket, normalizeMarketOnlyMappings, parseDataLayerJs } from '../../functions/_shared/erkul-sync.js';
import { toPlatform } from '../../functions/_shared/erkul-platform.js';
import { compareLayerFacts, invalidSyncedAtKeys } from './live-data-reproducibility.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHIPS_NORMALIZED_PATH = resolve(ROOT, 'data/external/erkul/ships-normalized.json');
const SHIPS_RAW_PATH = resolve(ROOT, 'data/external/erkul/ships.raw.json'); // platform(지상): calculatorType 직접 필드
const MARKET_PATH = resolve(ROOT, 'data/external/erkul/ship-market-normalized.json');
const SHOP_RAW_PATH = resolve(ROOT, 'data/external/erkul/shop.raw.json');
const MATCH_REPORT_PATH = resolve(ROOT, 'data/external/erkul/ship-match-report.json');
const MANUAL_MAP_PATH = resolve(ROOT, 'data/external/erkul/manual-ship-map.json');
const LIVE_STATS_PATH = resolve(ROOT, 'data/ship-live-stats.js');
const SHIP_MARKET_PATH = resolve(ROOT, 'data/ship-market.js');
const BUILD_REPORT_PATH = resolve(ROOT, 'data/external/erkul/live-data-build-report.json');
const INPUT_MANIFEST_PATH = resolve(ROOT, 'data/external/erkul/live-data-input-manifest.json');

const toSizeLabel = (n) => (typeof n === 'number' ? `S${n}` : null);

function sha256(text) {
    return createHash('sha256').update(text).digest('hex');
}

function parseArgs(argv) {
    return {
        verify: argv.includes('--verify'),
        recordManifest: argv.includes('--record-manifest')
    };
}

function stableJson(value) {
    return JSON.stringify(value);
}

function buildInputManifest(inputs, matchedCount) {
    return {
        schema: 'erkul-live-input-manifest/v1',
        source: 'erkul-live',
        syncedAt: inputs.erkul.syncedAt,
        matchedCount,
        inputs: {
            shipsRaw: sha256(inputs.shipsRawText),
            shipsNormalized: sha256(inputs.normalizedText),
            shopRaw: sha256(inputs.shopRawText),
            marketNormalized: sha256(inputs.marketText),
            matchReport: sha256(inputs.matchText),
            manualMap: sha256(inputs.manualMapText)
        }
    };
}

function assertMatchingLayer(label, expected, actual) {
    const comparison = compareLayerFacts(expected, actual);
    if (comparison.missing.length === 0 && comparison.unexpected.length === 0 && comparison.changed.length === 0) return;
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    const missing = expectedKeys.filter((key) => !Object.hasOwn(actual, key));
    const unexpected = actualKeys.filter((key) => !Object.hasOwn(expected, key));
    const changed = comparison.changed;
    throw new Error(`${label} 재현성 실패: 누락 ${missing.slice(0, 5).join(', ') || '0'} / 추가 ${unexpected.slice(0, 5).join(', ') || '0'} / 변경 ${changed.slice(0, 5).join(', ') || '0'}`);
}

function assertValidSyncedAt(label, layer) {
    const invalid = invalidSyncedAtKeys(layer);
    if (invalid.length === 0) return;
    throw new Error(`${label} has invalid syncedAt values: ${invalid.slice(0, 5).join(', ')}`);
}

function preserveTranslation(existingEntry, description) {
    const existing = existingEntry?.descriptions;
    if (!existing || existing.en !== description.en) return { ko: null };
    return {
        ko: existing.ko ?? null,
        ...(existing.koSource ? { koSource: existing.koSource } : {}),
        ...(existing.translatedAt ? { translatedAt: existing.translatedAt } : {})
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const [normalizedText, marketText, shopRawText, matchText, manualMapText, shipsRawText, currentStatsText] = await Promise.all([
        readFile(SHIPS_NORMALIZED_PATH, 'utf8'),
        readFile(MARKET_PATH, 'utf8'),
        readFile(SHOP_RAW_PATH, 'utf8'),
        readFile(MATCH_REPORT_PATH, 'utf8'),
        readFile(MANUAL_MAP_PATH, 'utf8'),
        readFile(SHIPS_RAW_PATH, 'utf8'),
        readFile(LIVE_STATS_PATH, 'utf8')
    ]);
    const erkul = JSON.parse(normalizedText);
    const market = JSON.parse(marketText);
    const shopRaw = JSON.parse(shopRawText);
    const matchReport = JSON.parse(matchText);
    const manualMap = JSON.parse(manualMapText);
    const shipsRaw = JSON.parse(shipsRawText);
    const currentLiveStats = parseDataLayerJs(currentStatsText, 'VOLT_SHIP_LIVE_STATS');
    const calcByLocal = new Map(shipsRaw.map((r) => [r.localName, r.calculatorType])); // platform 직접 근거
    const erkulByLocal = new Map(erkul.ships.map((s) => [s.localName, s]));
    // A-3 정규화 파일에는 live ships 목록에 없는 구형 선체가 빠진다.
    // 수동 검증된 market-only 매핑을 보존하려면 원본 상점 인벤토리 전체를 사용해야 한다.
    const marketByLocal = normalizeErkulMarket(shopRaw).byLocal;
    const marketOnlyMappings = normalizeMarketOnlyMappings(manualMap);
    // 포함 대상은 A-4 matched만. unmatched VOLT/Erkul-only/market-only/manual candidates는 제외한다.
    const matched = [...matchReport.matched].sort((a, b) => a.voltId.localeCompare(b.voltId));

    const liveStats = {};
    const shipMarket = {};
    const buildErrors = [];

    for (const row of matched) {
        const ship = erkulByLocal.get(row.erkulLocalName);
        if (!ship) {
            buildErrors.push(`matched row의 Erkul 원본 없음: ${row.erkulLocalName} (volt: ${row.voltId})`);
            continue;
        }
        const st = ship.externalStats;

        const descriptions = {
            source: ship.descriptions?.source ?? null,
            enRaw: ship.descriptions?.enRaw ?? null,
            en: ship.descriptions?.en ?? null,
            ...preserveTranslation(currentLiveStats[row.voltId], { en: ship.descriptions?.en ?? null })
        };
        liveStats[row.voltId] = {
            source: 'erkul-live',
            sourceVersion: 'live',
            syncedAt: erkul.syncedAt,
            erkulLocalName: ship.localName,
            erkulRef: ship.ref,

            manufacturer: st.manufacturer,
            role: st.role,
            career: st.career,
            size: toSizeLabel(st.size),
            platform: toPlatform(calcByLocal.get(ship.localName)),
            crewSize: st.crewSize,

            speeds: st.speeds,
            rotation: st.rotation,
            countermeasures: st.countermeasures,
            hp: st.hp,
            cargoScu: st.cargoScu,
            dimensions: st.dimensions,
            massKg: st.massKg,
            fuel: st.fuel,
            insurance: st.insurance,
            damageReduction: st.damageReduction,

            descriptions
        };

        const m = mergeMappedMarketRows(marketByLocal.get(ship.localName), row.voltId, marketByLocal, marketOnlyMappings);
        shipMarket[row.voltId] = {
            source: 'erkul-live',
            sourceVersion: 'live',
            syncedAt: market.syncedAt,
            erkulLocalName: ship.localName,
            erkulRef: ship.ref,
            purchase: m.purchase,
            rentals: m.rentals,
            anomalies: m.anomalies
        };
    }

    // ===== 빌드 내 검증 =====
    const matchedVoltIds = new Set(matched.map((r) => r.voltId));
    const validations = [];
    const assert = (label, ok, detail) => {
        validations.push({ label, ok, ...(detail ? { detail } : {}) });
        if (!ok) buildErrors.push(`검증 실패: ${label}${detail ? ` — ${detail}` : ''}`);
    };

    assert('live stats key 수 = matched 수', Object.keys(liveStats).length === matched.length, `${Object.keys(liveStats).length}/${matched.length}`);
    assert('market key 수 = matched 수', Object.keys(shipMarket).length === matched.length, `${Object.keys(shipMarket).length}/${matched.length}`);
    assert('모든 key가 A-4 matched VOLT id', Object.keys(liveStats).every((k) => matchedVoltIds.has(k)) && Object.keys(shipMarket).every((k) => matchedVoltIds.has(k)));
    assert('모든 stats entry에 source/syncedAt/erkulLocalName 존재',
        Object.values(liveStats).every((e) => e.source && e.syncedAt && e.erkulLocalName));
    assert('모든 market entry에 source/syncedAt/erkulLocalName 존재',
        Object.values(shipMarket).every((e) => e.source && e.syncedAt && e.erkulLocalName));

    const includedLocalNames = new Set(Object.values(liveStats).map((e) => e.erkulLocalName));
    const erkulOnly = matchReport.unmatchedErkul.map((s) => s.localName);
    assert(`Erkul-only ${erkulOnly.length}척 미포함`, erkulOnly.every((n) => !includedLocalNames.has(n)), erkulOnly.join(','));
    const marketOnly = matchReport.marketOnlyUnmatched.map((s) => s.erkulLocalName);
    assert(`market-only unmatched ${marketOnly.length}종 미포함`, marketOnly.every((n) => !includedLocalNames.has(n)), marketOnly.join(','));

    if (buildErrors.length > 0) {
        for (const err of buildErrors) console.error(err);
        process.exitCode = 1;
        return;
    }

    const manifest = buildInputManifest({ erkul, shipsRawText, normalizedText, shopRawText, marketText, matchText, manualMapText }, matched.length);

    if (args.verify || args.recordManifest) {
        const [currentStatsText, currentMarketText] = await Promise.all([
            readFile(LIVE_STATS_PATH, 'utf8'),
            readFile(SHIP_MARKET_PATH, 'utf8')
        ]);
        const currentStats = parseDataLayerJs(currentStatsText, 'VOLT_SHIP_LIVE_STATS');
        const currentMarket = parseDataLayerJs(currentMarketText, 'VOLT_SHIP_MARKET');
        assertValidSyncedAt('ship-live-stats', currentStats);
        assertValidSyncedAt('ship-market', currentMarket);
        assertMatchingLayer('ship-live-stats', liveStats, currentStats);
        assertMatchingLayer('ship-market', shipMarket, currentMarket);
        if (args.recordManifest) {
            await writeFile(INPUT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
            console.log(`입력 manifest 기록 완료: ${INPUT_MANIFEST_PATH}`);
            return;
        }
        const currentManifestText = await readFile(INPUT_MANIFEST_PATH, 'utf8');
        if (stableJson(manifest) !== stableJson(JSON.parse(currentManifestText))) {
            throw new Error('Erkul 입력 manifest가 현재 로컬 원본과 다릅니다. fetch → normalize → market → match → build-live 순서로 재생성하세요.');
        }
        console.log(`재현성 검증 통과: ${matched.length}척 · syncedAt=${manifest.syncedAt}`);
        return;
    }

    const header = (generator, varName, note) => [
        `// 자동 생성 파일 — 직접 수정하지 마세요. \`npm run ${generator}\`로 재생성.`,
        `// ${note}`,
        `// 원천: Erkul live (syncedAt: ${erkul.syncedAt}) | 대상: A-4 matched ${matched.length}척`,
        `window.${varName} = `
    ].join('\n');

    await writeFile(LIVE_STATS_PATH, `${header('shipdb:erkul:build-live', 'VOLT_SHIP_LIVE_STATS', '함선 상세 스펙 레이어 (volt-data.js와 분리). key = VOLT ship id.')}${JSON.stringify(liveStats)};\n`, 'utf8');
    await writeFile(SHIP_MARKET_PATH, `${header('shipdb:erkul:build-live', 'VOLT_SHIP_MARKET', '함선 구매처/렌탈 레이어 (volt-data.js와 분리). key = VOLT ship id.')}${JSON.stringify(shipMarket)};\n`, 'utf8');
    await writeFile(INPUT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const withPurchase = Object.values(shipMarket).filter((e) => e.purchase.length > 0).length;
    const withRentals = Object.values(shipMarket).filter((e) => e.rentals.length > 0).length;
    const withoutMarket = Object.values(shipMarket).filter((e) => e.purchase.length === 0 && e.rentals.length === 0).length;

    const buildReport = {
        source: 'erkul-live',
        syncedAt: erkul.syncedAt,
        matchedInput: matched.length,
        liveStatsEntries: Object.keys(liveStats).length,
        marketEntries: Object.keys(shipMarket).length,
        entriesWithPurchase: withPurchase,
        entriesWithRentals: withRentals,
        entriesWithoutMarket: withoutMarket,
        excluded: {
            unmatchedVolt: matchReport.unmatchedVolt.map((s) => s.voltId),
            unmatchedErkul: erkulOnly,
            marketOnlyUnmatched: marketOnly,
            voltVariants: (matchReport.voltVariants ?? []).map((s) => s.voltId)
        },
        validations
    };
    await writeFile(BUILD_REPORT_PATH, `${JSON.stringify(buildReport, null, 2)}\n`, 'utf8');

    console.log(`live stats: ${buildReport.liveStatsEntries} entries → ${LIVE_STATS_PATH}`);
    console.log(`market: ${buildReport.marketEntries} entries (purchase ${withPurchase} / rentals ${withRentals} / 없음 ${withoutMarket}) → ${SHIP_MARKET_PATH}`);
    console.log(`제외: VOLT-only ${buildReport.excluded.unmatchedVolt.length} / Erkul-only ${erkulOnly.length} / market-only ${marketOnly.length} / 에디션 변형 ${buildReport.excluded.voltVariants.length}`);
    console.log(`검증: ${validations.filter((v) => v.ok).length}/${validations.length} 통과`);
    console.log(`리포트: ${BUILD_REPORT_PATH}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
