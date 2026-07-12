import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const APPROVED_CANDIDATE_IDS = [
    'tiburon',
    'f7c-m-hornet-heartseeker-mk-ii',
    'f8a-lightning',
    'caterpillar-pirate',
    'dragonfly-star-kitten',
    'tyilui',
    'starlite',
    '600i-executive-edition'
];

function parseWindowData(source, variableName) {
    const prefix = `window.${variableName} = `;
    const start = source.indexOf(prefix);
    const end = source.lastIndexOf(';');
    if (start < 0 || end < start) throw new Error(`${variableName} data parsing failed`);
    return JSON.parse(source.slice(start + prefix.length, end));
}

async function readShipData() {
    const [voltSource, statsSource, marketSource, englishSource] = await Promise.all([
        readFile(new URL('../../data/volt-data.js', import.meta.url), 'utf8'),
        readFile(new URL('../../data/ship-live-stats.js', import.meta.url), 'utf8'),
        readFile(new URL('../../data/ship-market.js', import.meta.url), 'utf8'),
        readFile(new URL('../../data/ship-en.js', import.meta.url), 'utf8')
    ]);
    return {
        ships: vm.runInNewContext(`${voltSource}; VOLT_DATA.ships;`, {}),
        stats: parseWindowData(statsSource, 'VOLT_SHIP_LIVE_STATS'),
        market: parseWindowData(marketSource, 'VOLT_SHIP_MARKET'),
        english: parseWindowData(englishSource, 'VOLT_SHIP_EN')
    };
}

test('ShipDB: 승인된 Erkul 선체 8종은 전체 데이터 레이어에 포함', async () => {
    const { ships, stats, market, english } = await readShipData();
    for (const id of APPROVED_CANDIDATE_IDS) {
        const ship = ships.find((item) => item.id === id);
        assert.ok(ship, `${id}: base ShipDB entry is required`);
        assert.equal(ship.erkulStatus, 'matched');
        assert.ok(stats[id], `${id}: live stats entry is required`);
        assert.ok(market[id], `${id}: market entry is required`);
        assert.ok(english[id]?.description, `${id}: English description is required`);
    }
    assert.equal(ships.some((ship) => ship.name === 'Command Module'), false);
});

test('ShipDB: Aurora ES는 수동 매핑된 New Deal 구매처와 렌탈 정보를 유지', async () => {
    const { market } = await readShipData();
    const auroraEs = market['aurora-es'];
    assert.ok(auroraEs.purchase.some((row) => row.shop === 'New Deal' && row.mappedFrom === 'rsi_aurora_es'));
    assert.ok(auroraEs.rentals.some((row) => row.mappedFrom === 'rsi_aurora_es'));
});
