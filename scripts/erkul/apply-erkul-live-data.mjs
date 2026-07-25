import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    ERKUL_SHIPS_ENDPOINT,
    ERKUL_SHOP_ENDPOINT,
    fetchErkulJson,
    parseDataLayerJs,
    buildSyncPreview,
    buildNextLayers,
    computePreviewHash,
    normalizeMarketOnlyMappings
} from '../../functions/_shared/erkul-sync.js';

// ShipDB 2.0 Safe Apply (A-8).
//
// 원칙:
// - apply는 매칭을 새로 하지 않는다. 현재 ship-live-stats.js에 존재하는 voltId key만 갱신한다.
// - 신규 후보/market-only/미매칭 함선은 적용하지 않는다 (신규 함선 추가는 별도 마일스톤).
// - 기본은 dry-run: --confirm-preview-hash <hash>가 있고, 지금 재계산한 hash와 일치할 때만 파일을 쓴다.
//   hash는 Admin preview(GET /api/admin/ships/erkul-sync/preview)의 previewHash와 같은 방식으로 계산된다.
//
// 사용:
//   npm run shipdb:erkul:apply                                   (dry-run)
//   npm run shipdb:erkul:apply -- --confirm-preview-hash <hash>  (적용)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LIVE_STATS_PATH = resolve(ROOT, 'data/ship-live-stats.js');
const SHIP_MARKET_PATH = resolve(ROOT, 'data/ship-market.js');
const BUILD_REPORT_PATH = resolve(ROOT, 'data/external/erkul/live-data-build-report.json');
const ERKUL_INPUT_DIR = resolve(ROOT, 'data/external/erkul');
const SHIPS_RAW_PATH = resolve(ERKUL_INPUT_DIR, 'ships.raw.json');
const SHOPS_RAW_PATH = resolve(ERKUL_INPUT_DIR, 'shop.raw.json');
const FETCH_META_PATH = resolve(ERKUL_INPUT_DIR, 'fetch-meta.json');
const execFileAsync = promisify(execFile);
const INPUT_REBUILD_SCRIPTS = [
    'scripts/erkul/normalize-erkul-ships.mjs',
    'scripts/erkul/normalize-erkul-market.mjs',
    'scripts/erkul/match-erkul-to-volt.mjs'
];
const CANONICAL_BUILD_SCRIPTS = [
    'scripts/shipdb-rewrite/build-canonical.mjs',
    'scripts/shipdb-rewrite/build-localization.mjs',
    'scripts/shipdb-rewrite/build-operational.mjs',
    'scripts/shipdb-rewrite/build-role-localization.mjs',
    'scripts/shipdb-rewrite/build-ship-filter-taxonomy.mjs',
    'scripts/shipdb-rewrite/build-canonical-manifest.mjs'
];

function sha256(text) {
    return createHash('sha256').update(text).digest('hex');
}

async function runScripts(scripts, args = []) {
    for (const script of scripts) {
        await execFileAsync(process.execPath, [resolve(ROOT, script), ...args], { cwd: ROOT });
    }
}

async function rebuildCanonicalLayers() {
    await runScripts(CANONICAL_BUILD_SCRIPTS);
}

async function recordReproducibleInputs(ships, shops, fetchedAt) {
    const shipsText = `${JSON.stringify(ships, null, 2)}\n`;
    const shopsText = `${JSON.stringify(shops, null, 2)}\n`;
    const meta = {
        source: 'erkul-live',
        endpoints: { ships: ERKUL_SHIPS_ENDPOINT, shop: ERKUL_SHOP_ENDPOINT },
        fetchedAt,
        shipCount: ships.length,
        shopCount: shops.length,
        shipsBytes: Buffer.byteLength(shipsText, 'utf8'),
        shopBytes: Buffer.byteLength(shopsText, 'utf8'),
        rawSha256: { ships: sha256(shipsText), shops: sha256(shopsText) },
        note: 'Safe Apply confirmed input snapshot. Raw files remain local-only by .gitignore.'
    };
    await Promise.all([
        writeFile(SHIPS_RAW_PATH, shipsText, 'utf8'),
        writeFile(SHOPS_RAW_PATH, shopsText, 'utf8'),
        writeFile(FETCH_META_PATH, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
    ]);
    await runScripts(INPUT_REBUILD_SCRIPTS);
}

function parseArgs(argv) {
    const args = { dryRun: true, confirmHash: null };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--dry-run') args.dryRun = true;
        if (argv[i] === '--confirm-preview-hash') {
            args.confirmHash = argv[i + 1] || null;
            i += 1;
        }
    }
    if (args.confirmHash) args.dryRun = false;
    return args;
}

function layerHeader(varName, note, syncedAt, count) {
    return [
        '// 자동 생성 파일 — 직접 수정하지 마세요. `npm run shipdb:erkul:build-live` 또는 `npm run shipdb:erkul:apply`로 재생성.',
        `// ${note}`,
        `// 원천: Erkul live (syncedAt: ${syncedAt}) | 대상: A-4 matched ${count}척`,
        `window.${varName} = `
    ].join('\n');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const currentStats = parseDataLayerJs(await readFile(LIVE_STATS_PATH, 'utf8'), 'VOLT_SHIP_LIVE_STATS');
    const currentMarket = parseDataLayerJs(await readFile(SHIP_MARKET_PATH, 'utf8'), 'VOLT_SHIP_MARKET');

    console.log('Erkul live 데이터를 가져오는 중...');
    const erkulShipsRaw = await fetchErkulJson(ERKUL_SHIPS_ENDPOINT);
    const erkulShopsRaw = await fetchErkulJson(ERKUL_SHOP_ENDPOINT);
    if (!Array.isArray(erkulShipsRaw) || erkulShipsRaw.length < 100) {
        throw new Error(`Erkul ships 응답 비정상 (records: ${erkulShipsRaw?.length})`);
    }
    if (!Array.isArray(erkulShopsRaw) || erkulShopsRaw.length < 20) {
        throw new Error(`Erkul shop 응답 비정상 (records: ${erkulShopsRaw?.length})`);
    }

    // 검증·승격된 market-only 매핑 (manual-ship-map.json) — market 행만 보강, stats 불변
    let marketOnlyMappings = {};
    try {
        marketOnlyMappings = normalizeMarketOnlyMappings(JSON.parse(await readFile(resolve(ROOT, 'data/external/erkul/manual-ship-map.json'), 'utf8')));
    } catch {
        // 파일이 없으면 매핑 없이 진행
    }
    if (Object.keys(marketOnlyMappings).length) {
        console.log(`market-only 매핑 ${Object.keys(marketOnlyMappings).length}건 적용: ${Object.entries(marketOnlyMappings).map(([k, v]) => `${k}→${v}`).join(', ')}`);
    }

    const nextLayers = buildNextLayers({ currentStats, currentMarket, erkulShipsRaw, erkulShopsRaw, marketOnlyMappings });
    const previewHash = await computePreviewHash(nextLayers);
    const preview = buildSyncPreview({ currentStats, currentMarket, erkulShipsRaw, erkulShopsRaw, matchBaseline: null, marketOnlyMappings });

    const statsKeys = Object.keys(nextLayers.nextStats).length;
    const marketKeys = Object.keys(nextLayers.nextMarket).length;
    console.log(`\n=== Safe Apply ${args.dryRun ? 'DRY-RUN' : 'CONFIRM'} ===`);
    console.log(`갱신 대상 key: stats ${statsKeys} / market ${marketKeys} (현재 레이어 key만 — 재매칭 없음)`);
    console.log(`변경 요약: stats ${preview.summary.statsChanged}척 / 가격 ${preview.summary.priceChanges}건 / 구매처 ${preview.summary.purchaseLocationChanges}건 / 렌탈 ${preview.summary.rentalChanges}건 / 재고 ${preview.summary.stockChanges}건 / 설명 ${preview.summary.descriptionsChanged}척`);
    console.log(`적용 제외: 신규 후보 ${preview.summary.newErkulCandidates} / market-only ${preview.summary.marketOnlyUnmatched}`);
    for (const warning of nextLayers.warnings) console.log(`경고: ${warning}`);
    console.log(`previewHash: ${previewHash}`);

    if (args.dryRun) {
        console.log('\ndry-run — 파일을 변경하지 않았습니다.');
        console.log(`적용하려면: npm run shipdb:erkul:apply -- --confirm-preview-hash ${previewHash}`);
        return;
    }

    if (args.confirmHash !== previewHash) {
        console.error('\nhash 불일치 — preview 이후 Erkul 데이터가 바뀌었습니다. 파일을 변경하지 않았습니다.');
        console.error(`요청 hash:   ${args.confirmHash}`);
        console.error(`재계산 hash: ${previewHash}`);
        console.error('Admin preview(또는 dry-run)를 다시 실행해 최신 diff를 확인한 뒤 새 hash로 재시도하세요.');
        process.exitCode = 1;
        return;
    }

    // 검증: key 수 유지 + 기존 key 집합과 동일해야 한다 (신규 key 유입 금지)
    const currentKeys = Object.keys(currentStats).sort().join(',');
    const nextKeys = Object.keys(nextLayers.nextStats).sort().join(',');
    if (currentKeys !== nextKeys) {
        console.error('key 집합이 달라져 적용을 중단합니다 (apply는 기존 key만 갱신해야 함).');
        process.exitCode = 1;
        return;
    }

    const syncedAt = new Date().toISOString();
    const inject = (layers) => {
        const out = {};
        for (const [key, entry] of Object.entries(layers)) out[key] = { ...entry, syncedAt };
        return out;
    };
    const statsOut = inject(nextLayers.nextStats);
    const marketOut = inject(nextLayers.nextMarket);

    await recordReproducibleInputs(erkulShipsRaw, erkulShopsRaw, syncedAt);
    await writeFile(LIVE_STATS_PATH, `${layerHeader('VOLT_SHIP_LIVE_STATS', '함선 상세 스펙 레이어 (volt-data.js와 분리). key = VOLT ship id.', syncedAt, statsKeys)}${JSON.stringify(statsOut)};\n`, 'utf8');
    await writeFile(SHIP_MARKET_PATH, `${layerHeader('VOLT_SHIP_MARKET', '함선 구매처/렌탈 레이어 (volt-data.js와 분리). key = VOLT ship id.', syncedAt, marketKeys)}${JSON.stringify(marketOut)};\n`, 'utf8');

    const withPurchase = Object.values(marketOut).filter((e) => e.purchase.length > 0).length;
    const withRentals = Object.values(marketOut).filter((e) => e.rentals.length > 0).length;
    await writeFile(BUILD_REPORT_PATH, `${JSON.stringify({
        source: 'erkul-live',
        syncedAt,
        appliedAt: syncedAt,
        appliedBy: 'shipdb:erkul:apply (safe apply)',
        previewHash,
        matchedInput: statsKeys,
        liveStatsEntries: statsKeys,
        marketEntries: marketKeys,
        entriesWithPurchase: withPurchase,
        entriesWithRentals: withRentals,
        entriesWithoutMarket: marketKeys - withPurchase - Object.values(marketOut).filter((e) => e.purchase.length === 0 && e.rentals.length > 0).length,
        skipped: {
            newCandidates: nextLayers.skipped.newCandidates,
            marketOnly: nextLayers.skipped.marketOnly
        },
        warnings: nextLayers.warnings
    }, null, 2)}\n`, 'utf8');

    await rebuildCanonicalLayers();
    await runScripts(['scripts/erkul/build-ship-live-data.mjs'], ['--record-manifest']);
    console.log(`\n적용 완료: stats ${statsKeys} / market ${marketKeys} key 갱신 (syncedAt: ${syncedAt})`);
    console.log('canonical 계층과 client manifest도 함께 재생성했습니다. 번역 반영 후에는 npm run shipdb:erkul:post-apply를 실행하세요.');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
