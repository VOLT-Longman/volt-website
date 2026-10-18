// Explicit, reviewed identities only. Never infer matches from similar names.
export function reconcileReviewedCatalog({ currentStats, currentMarket, ships, review }) {
    const stats = structuredClone(currentStats);
    const market = structuredClone(currentMarket);
    const byLocal = new Map(ships.map(ship => [ship.localName, ship]));
    const changes = [];
    if (review.schema !== 'erkul-catalog-review/v1') throw new Error('Invalid catalog review schema');
    for (const row of [...review.migrations, ...review.additions]) {
        const incoming = byLocal.get(row.localName);
        if (!incoming || incoming.catalogVersion !== review.sourceVersion || incoming.data.ref !== row.ref || incoming.data.name !== row.name) {
            throw new Error(`Reviewed source identity changed: ${row.id}`);
        }
        const current = stats[row.id];
        const alreadyMapped = current?.erkulLocalName === row.localName && current?.erkulRef === row.ref;
        if (alreadyMapped) continue;
        if (row.from) {
            if (!current || current.erkulLocalName !== row.from.localName || current.erkulRef !== row.from.ref) {
                throw new Error(`Previous identity does not match review: ${row.id}`);
            }
        } else if (current || market[row.id]) {
            throw new Error(`New ship id already exists: ${row.id}`);
        }
        if (Object.entries(stats).some(([id, entry]) => id !== row.id && (entry.erkulLocalName === row.localName || entry.erkulRef === row.ref))) {
            throw new Error(`Duplicate reviewed identity: ${row.id}`);
        }
        stats[row.id] = { ...current, erkulLocalName: row.localName, erkulRef: row.ref };
        changes.push({ id: row.id, type: row.from ? 'migration' : 'addition', localName: row.localName });
    }
    return { currentStats: stats, currentMarket: market, changes };
}
