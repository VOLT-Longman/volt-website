import { isExcludedShip } from '../../functions/_shared/ship-catalog-policy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { reconcileReviewedCatalog } from '../../scripts/erkul/reconcile-reviewed-catalog.mjs';

const review = {
    schema: 'erkul-catalog-review/v1', sourceVersion: 'LIVE-test',
    migrations: [{ id: 'andromeda', localName: 'andromeda_gs', ref: 'new-ref', name: 'Mk IV Andromeda', from: { localName: 'andromeda', ref: 'old-ref' } }],
    additions: [{ id: 'centaurus', localName: 'centaurus', ref: 'mk5-ref', name: 'Mk V Centaurus' }]
};
const ships = [...review.migrations, ...review.additions].map(row => ({ localName: row.localName, catalogVersion: review.sourceVersion, data: { ref: row.ref, name: row.name } }));
const currentStats = { andromeda: { erkulLocalName: 'andromeda', erkulRef: 'old-ref', descriptions: { ko: '기존 번역' } }, historical: { syncedAt: '2026-01-01', sourceVersion: 'old' } };
const currentMarket = { andromeda: { purchase: [] }, historical: { syncedAt: '2026-01-01' } };

test('reviewed migration preserves stable ids and translations; new hull stays separate; history is untouched', () => {
    const result = reconcileReviewedCatalog({ currentStats, currentMarket, ships, review });
    assert.equal(result.currentStats.andromeda.erkulRef, 'new-ref');
    assert.equal(result.currentStats.andromeda.descriptions.ko, '기존 번역');
    assert.equal(result.currentStats.centaurus.erkulRef, 'mk5-ref');
    assert.deepEqual(result.currentStats.historical, currentStats.historical);
    assert.deepEqual(result.currentMarket, currentMarket);
    assert.equal(currentStats.andromeda.erkulRef, 'old-ref');
    assert.equal(reconcileReviewedCatalog({ ...result, ships, review }).changes.length, 0);
});

test('review fails closed on changed source ref/name/version or conflicting existing identity', () => {
    for (const mutate of [s => { s[0].data.ref = 'different'; }, s => { s[0].data.name = 'Mk V'; }, s => { s[0].catalogVersion = 'later'; }]) {
        const changed = structuredClone(ships); mutate(changed);
        assert.throws(() => reconcileReviewedCatalog({ currentStats, currentMarket, ships: changed, review }), /identity changed/);
    }
    assert.throws(() => reconcileReviewedCatalog({ currentStats: { ...currentStats, centaurus: {} }, currentMarket, ships, review }), /already exists/);
    assert.throws(() => reconcileReviewedCatalog({ currentStats: { ...currentStats, other: { erkulLocalName: 'andromeda_gs' } }, currentMarket, ships, review }), /Duplicate/);
    assert.throws(() => reconcileReviewedCatalog({ currentStats: { ...currentStats, andromeda: { erkulLocalName: 'unknown' } }, currentMarket, ships, review }), /Previous identity/);
});

test('published review identities, current source versions, and retained historical dates stay consistent', () => {
    const root = new URL('../../', import.meta.url);
    const read = path => readFileSync(new URL(path, root), 'utf8');
    const reviewed = JSON.parse(read('data/external/erkul/catalog-review-20261018.json'));
    const ctx = createContext({ window: {} });
    runInContext(read('data/ship-live-stats.js'), ctx);
    const live = ctx.window.VOLT_SHIP_LIVE_STATS;
    for (const row of [...reviewed.migrations, ...reviewed.additions]) {
        if (isExcludedShip(row)) { assert.equal(live[row.id], undefined); continue; }
        assert.equal(live[row.id].erkulLocalName, row.localName);
        assert.equal(live[row.id].erkulRef, row.ref);
        assert.equal(live[row.id].sourceVersion, reviewed.sourceVersion);
    }
    for (const id of reviewed.historical) {
        assert.notEqual(live[id].sourceVersion, reviewed.sourceVersion);
        assert.ok(live[id].syncedAt < '2026-10-18');
    }
    assert.equal(Object.values(live).filter(row => row.sourceVersion === reviewed.sourceVersion).length, 214);
    assert.equal(new Set(Object.values(live).map(row => row.erkulRef)).size, 217);
    assert.ok(!Object.values(live).some(row => row.erkulLocalName === 'drak_command_module'));
});
