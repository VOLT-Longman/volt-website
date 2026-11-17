/* Purchase planning is independent of equipment fitting and damage calculations. */
(function (root) {
    'use strict';
    const shopKey = (shop) => shop.terminalId ? `terminal:${shop.terminalId}` : JSON.stringify([shop.system || '', shop.place || '', shop.shop || '']);
    const nameKey = (name) => String(name || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
    function plan(rows, { mode = 'cheapest', shops = {}, order = [] } = {}) {
        const assigned = new Map();
        const missing = new Set();
        const valid = rows.map((row) => ({ ...row, offers: row.info.shops.filter((s) => Number.isFinite(s.price) && s.price > 0).sort((a, b) => a.price - b.price || shopKey(a).localeCompare(shopKey(b))) }));
        for (const row of valid) {
            if (!shops[row.id]) continue;
            const offer = row.offers.find((s) => shopKey(s) === shops[row.id]);
            if (offer) assigned.set(row.id, offer); else missing.add(row.id);
        }
        let pending = valid.filter((r) => !assigned.has(r.id) && !missing.has(r.id) && r.offers.length);
        if (mode === 'grouped') {
            // Respect manual choices, then reuse those stops before adding any new one.
            const existing = new Set([...assigned.values()].map(shopKey));
            for (const row of pending) {
                const offer = row.offers.find((s) => existing.has(shopKey(s)));
                if (offer) assigned.set(row.id, offer);
            }
            pending = pending.filter((r) => !assigned.has(r.id));
            while (pending.length) {
                const coverage = new Map();
                for (const row of pending) for (const shop of row.offers) {
                    const key = shopKey(shop);
                    const group = coverage.get(key) || { key, rows: new Map(), total: 0 };
                    if (!group.rows.has(row.id)) { group.rows.set(row.id, shop); group.total += shop.price * row.qty; }
                    coverage.set(key, group);
                }
                // Greedy set cover: most distinct products, then lowest basket cost.
                const best = [...coverage.values()].sort((a, b) => b.rows.size - a.rows.size || a.total - b.total || a.key.localeCompare(b.key))[0];
                for (const [id, shop] of best.rows) assigned.set(id, shop);
                pending = pending.filter((r) => !assigned.has(r.id));
            }
        } else for (const row of pending) assigned.set(row.id, row.offers[0]);
        const groups = new Map();
        let total = 0;
        for (const row of valid) {
            const shop = assigned.get(row.id);
            if (!shop) continue;
            const key = shopKey(shop);
            const group = groups.get(key) || { key, shop, rows: [], total: 0 };
            group.rows.push(row); group.total += shop.price * row.qty; total += shop.price * row.qty;
            groups.set(key, group);
        }
        const rank = (key) => order.includes(key) ? order.indexOf(key) : Number.MAX_SAFE_INTEGER;
        return { assigned, missing, total, cheapest: valid.reduce((sum, r) => sum + (r.offers[0]?.price || 0) * r.qty, 0), unknown: valid.filter((r) => !assigned.has(r.id)), groups: [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key) || 0) };
    }
    function families(items) {
        const byClass = new Map(Object.entries(items).map(([id, item]) => [item.cls, id]));
        const parents = new Map();
        for (const [id, item] of Object.entries(items)) {
            if (item.type !== 'WeaponGun' || item.hidden) continue;
            // Explicit cosmetic class suffixes only; never fold bespoke/turret variants.
            const base = item.cls?.replace(/_(?:mr\d+|CleanAir|Shark)$/i, '');
            const parent = base !== item.cls && byClass.get(base);
            if (parent && items[parent].type === item.type && items[parent].size === item.size) parents.set(id, parent);
        }
        return parents;
    }
    // Resolve only explicit duplicate aliases, never visible paint/bespoke variants.
    function resolveOffers(id, items, prices, named = []) {
        const item = items[id];
        if (!item) return [];
        const base = item.hidden && item.alias && items[item.alias] ? item.alias : id;
        const ids = [base, ...Object.keys(items).filter((key) => items[key].hidden && items[key].alias === base && items[key].type === items[base].type)];
        let offers = ids.flatMap((key) => prices.get(key.toLowerCase()) || []);
        if (!offers.length) {
            const matches = named.filter((row) => nameKey(row.name) === nameKey(item.name) && (row.size === null || Number(row.size) === Number(item.size)));
            const peers = Object.values(items).filter((row) => !row.hidden && row.type === item.type && nameKey(row.name) === nameKey(item.name) && (matches[0]?.size === null || row.size === item.size));
            if (matches.length === 1 && peers.length === 1) offers = matches[0].shops;
        }
        const seen = new Set();
        return [...offers].filter((offer) => Number(offer.price) > 0).sort((a, b) => a.price - b.price).filter((offer) => {
            const key = shopKey(offer); if (seen.has(key)) return false; seen.add(key); return true;
        });
    }
    const api = { shopKey, nameKey, plan, families, resolveOffers };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.VOLT_LOADOUT_PLANNER = api;
})(typeof window === 'undefined' ? null : window);
