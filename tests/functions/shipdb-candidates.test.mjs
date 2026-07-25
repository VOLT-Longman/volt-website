import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const APPROVED_CANDIDATE_IDS = [
    'tiburon',
    'f7c-m-hornet-heartseeker-mk-ii',
    'f8a-lightning',
    'caterpillar-pirate',
    'dragonfly-star-kitten',
    'tyilui',
    'starlite',
    '600i-executive-edition',
    'basher'
];

function parseWindowData(source, variableName) {
    const prefix = `window.${variableName} = `;
    const start = source.indexOf(prefix);
    const end = source.lastIndexOf(';');
    if (start < 0 || end < start) throw new Error(`${variableName} data parsing failed`);
    return JSON.parse(source.slice(start + prefix.length, end));
}

// 레거시 volt-data ships·ship-en은 삭제됐다. live/market 레이어만 읽고 나머지는 canonical에서 검증한다.
async function readShipData() {
    const [statsSource, marketSource] = await Promise.all([
        readFile(new URL('../../data/ship-live-stats.js', import.meta.url), 'utf8'),
        readFile(new URL('../../data/ship-market.js', import.meta.url), 'utf8')
    ]);
    return {
        stats: parseWindowData(statsSource, 'VOLT_SHIP_LIVE_STATS'),
        market: parseWindowData(marketSource, 'VOLT_SHIP_MARKET')
    };
}

// 레거시 volt-data ships 배열은 삭제됐다. 승인 선체의 존재는 canonical·표시 계층·live·market으로 확인한다.
test('ShipDB: 승인된 Erkul 선체 9종은 전체 데이터 레이어에 포함', async () => {
    const { stats, market } = await readShipData();
    const canonical = JSON.parse(await readFile(new URL('../../data/canonical/ships-canonical.json', import.meta.url), 'utf8'));
    const presentation = JSON.parse(await readFile(new URL('../../data/canonical/presentation-ships.json', import.meta.url), 'utf8'));
    const canonicalById = new Map(canonical.ships.map((ship) => [ship.id, ship]));
    const presentationById = new Map(presentation.records.map((record) => [record.id, record]));
    for (const id of APPROVED_CANDIDATE_IDS) {
        assert.ok(canonicalById.has(id), `${id}: canonical entry is required`);
        assert.ok(presentationById.get(id)?.name, `${id}: presentation name is required`);
        assert.ok(stats[id], `${id}: live stats entry is required`);
        assert.ok(market[id], `${id}: market entry is required`);
        assert.ok(canonicalById.get(id)?.descriptions?.en, `${id}: canonical English description is required`);
    }
    assert.equal(presentation.records.some((record) => record.name === 'Command Module'), false);
});

test('ShipDB: Aurora ES는 수동 매핑된 New Deal 구매처와 렌탈 정보를 유지', async () => {
    const { market } = await readShipData();
    const auroraEs = market['aurora-es'];
    assert.ok(auroraEs.purchase.some((row) => row.shop === 'New Deal' && row.mappedFrom === 'rsi_aurora_es'));
    assert.ok(auroraEs.rentals.some((row) => row.mappedFrom === 'rsi_aurora_es'));
});
