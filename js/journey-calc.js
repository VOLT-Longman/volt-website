/* Shared, deterministic calculations. Choices are inputs; prices and recipes come from sources. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.VOLT_JOURNEY_CALC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
    'use strict';
    const amount = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
    const round = value => Math.round(value * 1000000) / 1000000;
    // maxAgeDays: the player's price-age cut-off in days (owner rule 2026-11-19: default 3, shared with the helper tools).
    // Without it the earlier 60-minute rule applies, which the server-side AI check still uses.
    function fresh(row, now = Date.now(), maxAgeDays = null) {
        const at = amount(row?.date_modified);
        const limit = amount(maxAgeDays) > 0 ? Number(maxAgeDays) * 86400000 : 3600000;
        return at !== null && at > 0 && at * 1000 <= now && now - at * 1000 <= limit;
    }
    function trade(buy, sell, choices = {}, now = Date.now()) {
        const selling = choices.mode === 'sell';
        const purchase = selling ? null : amount(buy?.price_buy), price = amount(sell?.price_sell);
        const capacity = amount(choices.capacity), requested = amount(choices.quantity), budget = amount(choices.budget);
        const stock = selling ? null : amount(buy?.scu_buy), demand = amount(sell?.scu_sell);
        const result = { status: 'unavailable', quantity: null, cost: null, revenue: null, profit: null, stock, demand, capacity, budget, selling };
        if ((!selling && !(purchase > 0)) || !(price > 0)) return result;
        if (!fresh(sell, now, choices.maxAgeDays) || (!selling && !fresh(buy, now, choices.maxAgeDays))) return { ...result, status: 'stale' };
        if (requested === null || capacity === null || capacity <= 0) return { ...result, status: 'quantity' };
        if (!selling && budget === null) return { ...result, status: 'budget' };
        // All quantities are SCU. Unknown stock/demand is not zero, and never a guarantee.
        const affordable = selling ? Infinity : Math.floor(budget / purchase * 1000) / 1000;
        const quantity = Math.floor(Math.min(requested, capacity, stock ?? Infinity, demand ?? Infinity, affordable) * 1000) / 1000;
        const cost = selling ? null : round(quantity * purchase), revenue = round(quantity * price);
        return { ...result, status: 'ok', quantity, cost, revenue, profit: selling ? null : round(revenue - cost), limited: quantity < requested, reportAt: Math.min(Number(sell.date_modified), selling ? Infinity : Number(buy.date_modified)) };
    }
    function materials(catalog, choices) {
        const totals = new Map(), missing = [], recipes = [];
        if (catalog?.source !== 'game-files' || !catalog.gameVersion) return { materials: [], recipes, missing: choices.map(row => row.id), seconds: null };
        let seconds = 0, durationKnown = true;
        for (const row of choices) {
            const recipe = Object.hasOwn(catalog.recipes || {}, row.id) ? catalog.recipes[row.id] : null;
            if (!recipe || recipe.tier !== 0 || !Number.isInteger(row.count) || row.count < 1 || row.count > 100) { missing.push(row.id); continue; }
            recipes.push({ id: row.id, count: row.count });
            if (amount(recipe.s) === null) durationKnown = false;
            else seconds += recipe.s * row.count;
            for (const [field, unit] of [['m', 'SCU'], ['p', 'pieces']]) {
                for (const [id, value] of recipe[field] || []) {
                    if (amount(value) === null) { missing.push(row.id); continue; }
                    const key = `${id}:${unit}`, previous = totals.get(key);
                    totals.set(key, { id, unit, amount: round((previous?.amount || 0) + value * row.count) });
                }
            }
        }
        return { materials: [...totals.values()], recipes, missing: [...new Set(missing)], seconds: durationKnown && !missing.length ? seconds : null };
    }
    function mineralLocations(data, mineralId) {
        if (data?.source !== 'game-files') return [];
        return data.locations.filter(place => place.groups.some(group => group.rocks.some(rock => rock.minerals.some(part => part.id === mineralId))));
    }
    return { amount, fresh, trade, materials, mineralLocations };
});
