import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHIPS_NORMALIZED_PATH = resolve(ROOT, 'data/external/erkul/ships-normalized.json');
const MARKET_PATH = resolve(ROOT, 'data/external/erkul/ship-market-normalized.json');
const MATCH_REPORT_PATH = resolve(ROOT, 'data/external/erkul/ship-match-report.json');
const LIVE_STATS_PATH = resolve(ROOT, 'data/ship-live-stats.js');
const SHIP_MARKET_PATH = resolve(ROOT, 'data/ship-market.js');
const BUILD_REPORT_PATH = resolve(ROOT, 'data/external/erkul/live-data-build-report.json');

const toSizeLabel = (n) => (typeof n === 'number' ? `S${n}` : null);

async function main() {
    const erkul = JSON.parse(await readFile(SHIPS_NORMALIZED_PATH, 'utf8'));
    const market = JSON.parse(await readFile(MARKET_PATH, 'utf8'));
    const matchReport = JSON.parse(await readFile(MATCH_REPORT_PATH, 'utf8'));

    const erkulByLocal = new Map(erkul.ships.map((s) => [s.localName, s]));
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

            descriptions: {
                source: ship.descriptions?.source ?? null,
                enRaw: ship.descriptions?.enRaw ?? null,
                en: ship.descriptions?.en ?? null,
                ko: null
            }
        };

        const m = market.ships?.[ship.localName];
        shipMarket[row.voltId] = {
            source: 'erkul-live',
            sourceVersion: 'live',
            syncedAt: market.syncedAt,
            erkulLocalName: ship.localName,
            erkulRef: ship.ref,
            purchase: m?.purchase ?? [],
            rentals: m?.rentals ?? [],
            anomalies: m?.anomalies ?? []
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
    assert('Erkul-only 9척 미포함', erkulOnly.every((n) => !includedLocalNames.has(n)), erkulOnly.join(','));
    const marketOnly = matchReport.marketOnlyUnmatched.map((s) => s.erkulLocalName);
    assert('market-only unmatched 6종 미포함', marketOnly.every((n) => !includedLocalNames.has(n)), marketOnly.join(','));

    if (buildErrors.length > 0) {
        for (const err of buildErrors) console.error(err);
        process.exitCode = 1;
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
