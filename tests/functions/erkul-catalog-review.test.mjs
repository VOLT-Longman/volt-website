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
    // 검토 기록(20261018)의 식별자는 고정이지만, 원본 버전은 이후 Safe Apply로 올라간다.
    // 버전 일치는 현재 수집 메타(catalog-meta.json)를 기준으로 확인한다.
    const currentVersion = JSON.parse(read('data/canonical/ships-canonical.json')).sourceVersion;
    for (const row of [...reviewed.migrations, ...reviewed.additions]) {
        if (isExcludedShip(row)) { assert.equal(live[row.id], undefined); continue; }
        assert.equal(live[row.id].gameClass, row.localName);
        assert.equal(live[row.id].gameRef, row.ref);
        assert.equal(live[row.id].sourceVersion, currentVersion);
    }
    for (const id of reviewed.historical) {
        assert.equal(live[id].sourceVersion, currentVersion);
        assert.equal(live[id].source, 'game-files');
    }
    assert.equal(Object.values(live).filter(row => row.sourceVersion === currentVersion).length, 221);
    assert.equal(new Set(Object.values(live).map(row => row.gameRef)).size, 221);
    assert.ok(!Object.values(live).some(row => row.gameClass === 'drak_command_module'));
});
