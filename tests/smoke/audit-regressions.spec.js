const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test('A1: accounts restore only server preferences; remote deletions stay deleted', async ({ page }) => {
    await mockApi(page, { loggedIn: true });
    let account = 'A';
    let deleted = false;
    const writes = [];
    await page.route('**/auth/me', (route) => route.fulfill({ json: {
        logged_in: true, user: { sub: account, username: account, roles: ['member'] }
    } }));
    await page.route('**/api/me/preferences', (route) => {
        if (route.request().method() === 'PUT') writes.push(route.request().postDataJSON());
        return route.fulfill({ json: { preferences: account === 'A'
            ? { favorites: ['asgard'], planner: { shipId: 'asgard', cargo: '10' } }
            : { favorites: deleted ? [] : ['hammerhead'], planner: { shipId: 'hammerhead', cargo: '20' } } } });
    });
    await gotoSection(page, '#trade-planner');
    await expect(page.locator('#logistics-cargo')).toHaveValue('10');
    account = 'B';
    await page.reload();
    await expect(page.locator('#logistics-cargo')).toHaveValue('20');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('volt-hangar:user:B')))).toEqual(['hammerhead']);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('volt-hangar:user:A')))).toEqual(['asgard']);
    deleted = true;
    await page.reload();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('volt-hangar:user:B')))).toEqual([]);
    expect(writes).toEqual([]);
});

test('A4/A6: stalled gallery does not block notices, canonical ships, or authoritative empty leadership/timeline', async ({ page }) => {
    await mockApi(page);
    let release;
    const stalled = new Promise((resolve) => { release = resolve; });
    await page.route('**/api/gallery', async (route) => { await stalled; await route.fulfill({ json: { items: [] } }); });
    await page.route('**/api/notices', (route) => route.fulfill({ json: { items: [{ id: 'fresh', title: 'Fresh audit notice', content: '', date: '2026-09-27' }] } }));
    for (const collection of ['leadership', 'timeline']) await page.route(`**/api/${collection}`, (route) => route.fulfill({ json: { items: [] } }));
    try {
        await gotoSection(page, '#ships');
        await expect(page.locator('#ships-grid [data-compare-ship-id]')).toHaveCount(249);
        expect(await page.evaluate(() => window.VOLT_DATA.announcements[0].title)).toBe('Fresh audit notice');
        expect(await page.evaluate(() => [window.VOLT_DATA.leadership.length, window.VOLT_DATA.timeline.length])).toEqual([0, 0]);
        await expect(page.locator('#leadership-grid > *')).toHaveCount(0);
        await expect(page.locator('#timeline-list > *')).toHaveCount(0);
    } finally { release(); }
});

test('A5: warning payload preserves known data, shows failure, and retry accepts an empty success', async ({ page }) => {
    await mockApi(page);
    let failed = true;
    await page.route('**/api/notices', (route) => route.fulfill({ json: failed ? { items: [], warning: 'unavailable' } : { items: [] } }));
    await gotoSection(page, '#notices');
    await expect(page.locator('#cms-load-status')).toBeVisible();
    expect(await page.evaluate(() => window.VOLT_DATA.announcements.length)).toBeGreaterThan(0);
    failed = false;
    await page.locator('#cms-load-status button').click();
    await expect(page.locator('#cms-load-status')).toBeHidden();
    expect(await page.evaluate(() => window.VOLT_DATA.announcements)).toEqual([]);
});

test('A4: a stalled response times out and provides a working retry', async ({ page }) => {
    await mockApi(page);
    let release;
    let held = true;
    const stalled = new Promise((resolve) => { release = resolve; });
    await page.route('**/api/gallery', async (route) => {
        if (held) await stalled;
        await route.fulfill({ json: { items: [] } }).catch(() => {});
    });
    try {
        await gotoSection(page, '#home');
        await expect(page.locator('#cms-load-status')).toBeVisible({ timeout: 8000 });
        held = false;
        release();
        await page.locator('#cms-load-status button').click();
        await expect(page.locator('#cms-load-status')).toBeHidden();
    } finally { release(); }
});

for (const outcome of ['success', 'failure', 'selection-only']) {
    test(`A3: obsolete commodity ${outcome} cannot overwrite the current selection`, async ({ page }) => {
        await mockApi(page);
        await page.route(/\/api\/uex\/commodities$/, (route) => route.fulfill({ json: { data: [
            { id: 1, name: 'Gold', is_visible: 1, is_available_live: 1 },
            { id: 2, name: 'Beryl', is_visible: 1, is_available_live: 1 }
        ] } }));
        let release;
        let started;
        const requested = new Promise((resolve) => { started = resolve; });
        const stalled = new Promise((resolve) => { release = resolve; });
        const prices = (id, name) => ({ data: [{ id_terminal: id, terminal_name: name, price_buy: 100, date_modified: Math.floor(Date.now() / 1000) }] });
        await page.route('**/api/uex/commodities/1/prices', async (route) => {
            started();
            await stalled;
            await route.fulfill(outcome === 'failure' ? { status: 500, json: {} } : { json: prices(1, 'GOLD PORT') });
        });
        await page.route('**/api/uex/commodities/2/prices', (route) => route.fulfill({ json: prices(2, 'BERYL PORT') }));
        await gotoSection(page, '#trade-planner');
        const select = async (name, id) => {
            await page.locator('#uex-commodity-search').fill(name);
            await page.locator(`[data-commodity-id="${id}"]`).click();
        };
        await select('Gold', 1);
        await page.locator('#uex-refresh').click();
        await requested;
        await select('Beryl', 2);
        if (outcome !== 'selection-only') {
            await page.locator('#uex-refresh').click();
            await expect(page.locator('#uex-results')).toContainText('BERYL PORT');
        }
        const finished = page.waitForResponse('**/api/uex/commodities/1/prices');
        release();
        await finished;
        await expect(page.locator('#uex-results')).not.toContainText('GOLD PORT');
        await expect(page.locator('#uex-results .uex-error')).toHaveCount(0);
        expect(await page.evaluate(() => window.VOLT_UEX_PANEL.getCurrentModel()?.commodity?.id || null)).toBe(outcome === 'selection-only' ? null : 2);
    });
}
