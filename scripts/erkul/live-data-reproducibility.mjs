function stableJson(value) {
    return JSON.stringify(value);
}

function withoutOperationalTimestamp(entry) {
    const { syncedAt: _syncedAt, ...facts } = entry;
    return facts;
}

export function compareLayerFacts(expectedLayer, actualLayer) {
    const expectedKeys = Object.keys(expectedLayer).sort();
    const actualKeys = Object.keys(actualLayer).sort();
    const missing = expectedKeys.filter((key) => !Object.hasOwn(actualLayer, key));
    const unexpected = actualKeys.filter((key) => !Object.hasOwn(expectedLayer, key));
    const changed = expectedKeys.filter((key) => (
        Object.hasOwn(actualLayer, key)
        && stableJson(withoutOperationalTimestamp(expectedLayer[key]))
            !== stableJson(withoutOperationalTimestamp(actualLayer[key]))
    ));
    return { missing, unexpected, changed };
}

export function invalidSyncedAtKeys(layer) {
    return Object.entries(layer)
        .filter(([, entry]) => (
            typeof entry?.syncedAt !== 'string'
            || Number.isNaN(Date.parse(entry.syncedAt))
        ))
        .map(([key]) => key);
}
