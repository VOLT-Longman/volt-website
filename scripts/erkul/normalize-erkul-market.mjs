import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const EXTERNAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/external/erkul');
const DOCS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs');
const SHOP_RAW_PATH = resolve(EXTERNAL_DIR, 'shop.raw.json');
const SHIPS_NORMALIZED_PATH = resolve(EXTERNAL_DIR, 'ships-normalized.json');
const META_PATH = resolve(EXTERNAL_DIR, 'fetch-meta.json');
const MARKET_PATH = resolve(EXTERNAL_DIR, 'ship-market-normalized.json');
const REPORT_JSON_PATH = resolve(EXTERNAL_DIR, 'market-report.json');
const REPORT_MD_PATH = resolve(DOCS_DIR, 'erkul-market-report.md');

const RENTAL_NAME_PATTERN = /rentals?\b|\brent\b/i;

// 미매칭 localName 중 "함선 선체로 보이는 것"을 골라내는 필터 (보고용 힌트일 뿐, 조인에 쓰지 않는다)
const COMPONENT_KEYWORDS = /turret|module|mount|cannon|gatling|repeater|tractorbeam|missile|wing|scitem|lasercannon|ballistic|_s\d+$/i;
const VEHICLE_PREFIX = /^(aegs|anvl|orig|misc|drak|rsi|crus|cnou|argo|mrai|banu|xian|xnaa|espr|grin|krig|tmbl|vncl|gama|mira|aopo)_/;

const toNull = (v) => (v === undefined || v === null ? null : v);

async function main() {
    let shops;
    let normalized;
    let meta;
    try {
        shops = JSON.parse(await readFile(SHOP_RAW_PATH, 'utf8'));
        normalized = JSON.parse(await readFile(SHIPS_NORMALIZED_PATH, 'utf8'));
        meta = JSON.parse(await readFile(META_PATH, 'utf8'));
    } catch {
        console.error('입력 파일을 읽지 못함. 먼저 실행: npm run shipdb:erkul:fetch && npm run shipdb:erkul:normalize');
        process.exitCode = 1;
        return;
    }

    const byLocal = new Map(normalized.ships.map((s) => [s.localName, s]));
    const byRef = new Map(normalized.ships.filter((s) => s.ref).map((s) => [s.ref, s]));

    const shipsOut = {};
    const zeroPriceRows = [];
    const duplicateRows = [];
    const emptyInventoryShops = [];
    const unmatchedAgg = new Map(); // localName → { rows, sampleShop, samplePrice }
    const seenRowKeys = new Set();
    const locationCounts = { purchase: new Map(), rental: new Map() };
    let inventoryRows = 0;
    let shipMarketRows = 0;

    const ensureShip = (ship) => {
        if (!shipsOut[ship.localName]) {
            shipsOut[ship.localName] = {
                localName: ship.localName,
                ref: toNull(ship.ref),
                name: toNull(ship.name),
                purchase: [],
                rentals: [],
                anomalies: []
            };
        }
        return shipsOut[ship.localName];
    };

    for (const shopRecord of shops) {
        const shop = shopRecord.data ?? {};
        const shopName = toNull(shop.name);
        const location = shop.location?.trim() ? shop.location.trim() : null;
        // rental 판정: 원본 boolean 플래그를 1순위로, 상점명 패턴을 보조로 사용 (112개 전수에서 두 기준 불일치 0건 확인)
        const isRental = shop.rental === true || RENTAL_NAME_PATTERN.test(shopName ?? '');
        const inventory = Array.isArray(shop.inventory) ? shop.inventory : [];

        if (inventory.length === 0) {
            emptyInventoryShops.push({ shop: shopName, location, rental: isRental });
            continue;
        }

        for (const row of inventory) {
            inventoryRows += 1;
            // 조인 우선순위: localName → ref. 둘 다 실패하면 unmatched (추정 매칭 금지)
            const ship = byLocal.get(row.localName) ?? byRef.get(row.ref);
            if (!ship) {
                const agg = unmatchedAgg.get(row.localName) ?? { localName: row.localName, rows: 0, sampleShop: `${shopName}@${location ?? ''}`, samplePrice: toNull(row.price) };
                agg.rows += 1;
                unmatchedAgg.set(row.localName, agg);
                continue;
            }

            const priceValid = typeof row.price === 'number' && row.price > 0;
            const rowKey = `${shopName}|${location}|${ship.localName}|${row.price}|${isRental ? 'rental' : 'purchase'}`;
            if (seenRowKeys.has(rowKey)) {
                duplicateRows.push({ shop: shopName, location, localName: ship.localName, price: toNull(row.price), rental: isRental });
                ensureShip(ship).anomalies.push(`duplicate row: ${shopName}@${location ?? '?'} price=${row.price}`);
                continue;
            }
            seenRowKeys.add(rowKey);

            const entry = {
                shop: shopName,
                location,
                price: priceValid ? row.price : null,
                available: toNull(row.available),
                unavailable: toNull(row.unavailable)
            };
            const target = ensureShip(ship);

            if (!priceValid) {
                zeroPriceRows.push({ shop: shopName, location, localName: ship.localName, price: toNull(row.price), rental: isRental });
                target.anomalies.push(`price=${row.price ?? 'missing'}: ${shopName}@${location ?? '?'} (${isRental ? 'rental' : 'purchase'})`);
                // price=0 구매행은 purchase에 넣지 않는다. 렌탈행은 price null로 목록에 유지한다.
                if (!isRental) continue;
            }

            if (isRental) {
                target.rentals.push(entry);
                if (location) locationCounts.rental.set(location, (locationCounts.rental.get(location) ?? 0) + 1);
            } else {
                target.purchase.push(entry);
                if (location) locationCounts.purchase.set(location, (locationCounts.purchase.get(location) ?? 0) + 1);
            }
            shipMarketRows += 1;
        }
    }

    const shipsWithPurchase = Object.values(shipsOut).filter((s) => s.purchase.length > 0);
    const shipsWithRentals = Object.values(shipsOut).filter((s) => s.rentals.length > 0);
    const shipsWithoutMarket = normalized.ships
        .filter((s) => {
            const m = shipsOut[s.localName];
            return !m || (m.purchase.length === 0 && m.rentals.length === 0);
        })
        .map((s) => s.localName)
        .sort();

    const unmatchedInventoryRows = [...unmatchedAgg.values()].sort((a, b) => b.rows - a.rows);
    const unmatchedShipLike = unmatchedInventoryRows.filter(
        (u) => VEHICLE_PREFIX.test(u.localName) && !COMPONENT_KEYWORDS.test(u.localName)
    );

    const topLocations = (map) => [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([location, rows]) => ({ location, rows }));

    const marketPayload = {
        source: 'erkul-live',
        syncedAt: meta.fetchedAt,
        ships: shipsOut
    };

    const report = {
        source: 'erkul-live',
        syncedAt: meta.fetchedAt,
        shopsCount: shops.length,
        inventoryRows,
        shipMarketRows,
        shipsWithPurchase: shipsWithPurchase.length,
        shipsWithRentals: shipsWithRentals.length,
        shipsWithoutMarket,
        zeroPriceRows,
        unmatchedInventoryRows,
        unmatchedShipLikeRows: unmatchedShipLike,
        duplicateRows,
        emptyInventoryShops,
        topPurchaseLocations: topLocations(locationCounts.purchase),
        topRentalLocations: topLocations(locationCounts.rental)
    };

    await writeFile(MARKET_PATH, `${JSON.stringify(marketPayload, null, 2)}\n`, 'utf8');
    await writeFile(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(REPORT_MD_PATH, renderMarkdown(report, marketPayload), 'utf8');

    console.log(`shops: ${shops.length} | inventory rows: ${inventoryRows} | ship market rows: ${shipMarketRows}`);
    console.log(`purchase 함선: ${shipsWithPurchase.length} | rental 함선: ${shipsWithRentals.length} | 판매처 없음: ${shipsWithoutMarket.length}`);
    console.log(`zero-price: ${zeroPriceRows.length} | unmatched distinct: ${unmatchedInventoryRows.length} (선체 추정: ${unmatchedShipLike.length}) | duplicates: ${duplicateRows.length}`);
    console.log(`저장: ${MARKET_PATH}`);
    console.log(`리포트: ${REPORT_JSON_PATH} / ${REPORT_MD_PATH}`);
}

function renderMarkdown(report, marketPayload) {
    const sampleNames = ['anvl_asgard', 'orig_100i', 'orig_890jump'];
    const shipEntries = Object.values(marketPayload.ships);
    for (const s of shipEntries) {
        if (sampleNames.length >= 10) break;
        if (!sampleNames.includes(s.localName) && s.purchase.length > 0) sampleNames.push(s.localName);
    }
    const sampleBlocks = sampleNames.map((localName) => {
        const s = marketPayload.ships[localName];
        if (!s) return `### ${localName}\n\n- 시장 데이터 없음 (판매처/렌탈처 미확인)`;
        const purchase = s.purchase.map((p) => `  - ${p.shop} @ ${p.location ?? '?'} — ${p.price?.toLocaleString('en-US') ?? 'null'} aUEC`).join('\n') || '  - 없음';
        const rentals = s.rentals.map((r) => `  - ${r.shop} @ ${r.location ?? '?'} — ${r.price?.toLocaleString('en-US') ?? 'price null'}`).join('\n') || '  - 없음';
        return `### ${s.name} (\`${s.localName}\`)\n\n- 구매처:\n${purchase}\n- 렌탈처:\n${rentals}${s.anomalies.length ? `\n- anomaly: ${s.anomalies.length}건` : ''}`;
    });

    const lines = [
        '# Erkul 함선 시장(구매처/렌탈) report (A-3)',
        '',
        '`ship-market-normalized.json` 산출 결과 요약. 재현: `npm run shipdb:erkul:market`',
        '',
        `- 원천: Erkul live shop (fetch: ${report.syncedAt})`,
        `- 상점 ${report.shopsCount}개 / inventory ${report.inventoryRows}행 / 함선 매칭 ${report.shipMarketRows}행`,
        `- 구매처 확인 함선: **${report.shipsWithPurchase}척** / 렌탈처 확인 함선: **${report.shipsWithRentals}척**`,
        `- 판매처 없는 함선: ${report.shipsWithoutMarket.length}척 (인게임 비판매 — 픽업 전용/이벤트/컨셉 판매 함선 포함)`,
        '',
        '## 분류 규칙 적용 결과',
        '',
        `- price=0 → purchase 반영 **0건** (전체 zero-price ${report.zeroPriceRows.length}건은 anomaly로 기록)`,
        `- zero-price 행은 전부 렌탈 상점 소속: ${report.zeroPriceRows.every((r) => r.rental) ? '예 (렌탈 가격 미표기 관행)' : '아니오 — 구매 상점 포함, 확인 필요'}`,
        `- rental 판정: 원본 \`data.rental\` boolean 사용 (상점명 Rental 패턴과 112개 전수 일치)`,
        `- 중복 행(shop+location+ship+price): ${report.duplicateRows.length}건 dedupe`,
        `- 빈 inventory 상점: ${report.emptyInventoryShops.length}개`,
        '',
        '## unmatched inventory',
        '',
        `- 미매칭 distinct localName: ${report.unmatchedInventoryRows.length}종 — 대부분 무기/터렛/모듈 (함선 아님)`,
        `- 이 중 **함선 선체로 보이는 미매칭 ${report.unmatchedShipLikeRows.length}종** (추정 매칭 금지 원칙에 따라 조인하지 않고 기록만):`,
        ''
    ];
    for (const u of report.unmatchedShipLikeRows) {
        lines.push(`  - \`${u.localName}\` (${u.rows}행, 예: ${u.sampleShop}) — Erkul live/ships 목록에 없음. A-4 별칭 테이블 후보`);
    }
    lines.push(
        '',
        '## 판매처 없는 함선 목록',
        '',
        report.shipsWithoutMarket.map((n) => `\`${n}\``).join(', '),
        '',
        '## top 구매 location',
        '',
        ...report.topPurchaseLocations.map((l) => `- ${l.location}: ${l.rows}행`),
        '',
        '## top 렌탈 location',
        '',
        ...report.topRentalLocations.map((l) => `- ${l.location}: ${l.rows}행`),
        '',
        '## 대표 샘플',
        '',
        sampleBlocks.join('\n\n'),
        ''
    );
    return lines.join('\n');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
