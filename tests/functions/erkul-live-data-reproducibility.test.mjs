import assert from 'node:assert/strict';
import test from 'node:test';
import {
    compareLayerFacts,
    invalidSyncedAtKeys
} from '../../scripts/erkul/live-data-reproducibility.mjs';

const baseLayer = {
    aurora: { source: 'erkul-live', syncedAt: '2026-07-17T15:11:08.433Z', cargoScu: 3 },
    cutter: { source: 'erkul-live', syncedAt: '2026-07-17T15:11:08.433Z', cargoScu: 4 }
};

test('Safe Apply applied timestamp is excluded from fact reproducibility', () => {
    const appliedLayer = {
        aurora: { ...baseLayer.aurora, syncedAt: '2026-07-20T14:27:20.482Z' },
        cutter: { ...baseLayer.cutter, syncedAt: '2026-07-20T14:27:20.482Z' }
    };
    assert.deepEqual(compareLayerFacts(baseLayer, appliedLayer), {
        missing: [], unexpected: [], changed: []
    });
});

test('Erkul fact changes and invalid applied timestamps remain detectable', () => {
    const changedLayer = {
        aurora: { ...baseLayer.aurora, cargoScu: 6 },
        cutter: { ...baseLayer.cutter, syncedAt: 'not-a-date' }
    };
    assert.deepEqual(compareLayerFacts(baseLayer, changedLayer).changed, ['aurora']);
    assert.deepEqual(invalidSyncedAtKeys(changedLayer), ['cutter']);
});
