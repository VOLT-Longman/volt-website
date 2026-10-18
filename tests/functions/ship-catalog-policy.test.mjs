import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { SHIP_CATALOG_EXCLUSIONS, isExcludedShip } from '../../functions/_shared/ship-catalog-policy.js';
import { buildNextLayers, buildSyncPreview, parseDataLayerJs } from '../../functions/_shared/erkul-sync.js';
import { reconcileReviewedCatalog } from '../../scripts/erkul/reconcile-reviewed-catalog.mjs';

test('permanent exclusions match stable upstream identities without excluding base models or future unpictured ships', () => {
  assert.equal(SHIP_CATALOG_EXCLUSIONS.length, 8);
  for (const entry of SHIP_CATALOG_EXCLUSIONS) {
    assert.ok(isExcludedShip(entry.id));
    assert.ok(isExcludedShip({ name: entry.name }));
    if (entry.ref) assert.ok(isExcludedShip({ id: 'renamed', data: { ref: entry.ref, name: 'renamed' } }));
    if (entry.localName) assert.ok(isExcludedShip({ localName: entry.localName }));
  }
  for (const id of ['600i-explorer', 'caterpillar', 'constellation-phoenix', 'dragonfly', 'f8c-lightning', 'gladius', 'nautilus', 'new-ship-without-photo']) {
    assert.equal(isExcludedShip(id), false, id);
  }
});

test('Safe Apply and preview cannot retain excluded IDs or promote their renamed upstream records', () => {
  const entry = SHIP_CATALOG_EXCLUSIONS[0];
  const raw = { localName: entry.localName, data: { ref: entry.ref, name: entry.name } };
  const input = {
    currentStats: { [entry.id]: { erkulLocalName: entry.localName, erkulRef: entry.ref } },
    currentMarket: { [entry.id]: { purchase: [], rentals: [] } },
    erkulShipsRaw: [raw, { ...raw, localName: 'renamed_upstream' }], erkulShopsRaw: [],
  };
  const next = buildNextLayers(input);
  assert.deepEqual(next.nextStats, {});
  assert.deepEqual(next.nextMarket, {});
  const preview = buildSyncPreview(input);
  assert.equal(preview.summary.matched, 0);
  assert.deepEqual(preview.changes.newCandidates, []);
});

test('reviewed catalog reconciliation cannot re-add an excluded ship even with a new canonical ID', () => {
  const entry = SHIP_CATALOG_EXCLUSIONS[1];
  const row = { id: 'renamed-pirate', localName: entry.localName, ref: entry.ref, name: entry.name };
  const result = reconcileReviewedCatalog({
    currentStats: { [entry.id]: { erkulLocalName: entry.localName } }, currentMarket: { [entry.id]: {} },
    ships: [{ localName: row.localName, catalogVersion: 'test', data: { ref: row.ref, name: row.name } }],
    review: { schema: 'erkul-catalog-review/v1', sourceVersion: 'test', migrations: [], additions: [row] },
  });
  assert.deepEqual(result.currentStats, {});
  assert.deepEqual(result.currentMarket, {});
  assert.deepEqual(result.changes, []);
});

test('all active catalog layers exclude the eight entries and every remaining ship has a reviewed photo', async () => {
  const read = async (file) => JSON.parse(await readFile(new URL(`../../${file}`, import.meta.url), 'utf8'));
  for (const file of ['ships-canonical', 'presentation-ships', 'ships-rsi-official', 'localization-ships', 'localization-rsi-official', 'operational-ships']) {
    const layer = await read(`data/canonical/${file}.json`);
    for (const row of layer.ships || layer.records) assert.equal(isExcludedShip(row), false, `${file}: ${row.id}`);
  }
  for (const [file, variable] of [['ship-live-stats', 'VOLT_SHIP_LIVE_STATS'], ['ship-market', 'VOLT_SHIP_MARKET']]) {
    const layer = parseDataLayerJs(await readFile(new URL(`../../data/${file}.js`, import.meta.url), 'utf8'), variable);
    assert.equal(Object.keys(layer).length, 217);
    for (const [id, row] of Object.entries(layer)) assert.equal(isExcludedShip(id, row), false, id);
  }
  const live = await read('data/canonical/ships-canonical.json');
  const official = await read('data/canonical/ships-rsi-official.json');
  const imagery = await read('data/ship-imagery.json');
  assert.equal(live.count + official.count, 246);
  assert.deepEqual([...live.ships, ...official.records].map(row => row.id).sort(), imagery.records.map(row => row.id).sort());
});
