const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test('price refresh bypasses local cache and reports selected route age and available quantity', async ({ page }) => {
    await mockApi(page);
    let queries = 0;
    const now = Math.floor(Date.now() / 1000);
    await page.route(/\/api\/uex\/commodities$/, route => route.fulfill({ json: { status: 'ok', data: [{ id: 33, name: 'Gold', code: 'GOLD', is_visible: 1, is_available_live: 1 }] } }));
    await page.route(/\/api\/uex\/commodities\/33\/prices(?:\?refresh=1)?$/, route => {
        queries++;
        return route.fulfill({ json: { status: 'ok', data: [
            { id_terminal: 1, terminal_name: 'Buy', price_buy: queries === 1 ? 24360 : 24361, scu_buy: 21, date_modified: now - 86400 },
            { id_terminal: 2, terminal_name: 'Sell', price_sell: 31000, scu_sell: 840, date_modified: now - 43200 },
            { id_terminal: 3, terminal_name: 'Unrelated', price_buy: 40000, price_sell: 20000, date_modified: now }
        ] } });
    });
    await gotoSection(page, '#trade-planner');
    await page.locator('#logistics-cargo').fill('696');
    await page.locator('#uex-commodity-search').fill('Gold');
    await page.locator('[data-commodity-id="33"]').click();
    await page.locator('#uex-refresh').click();
    await expect(page.locator('#uex-results .uex-stale')).toBeVisible();
    await expect(page.locator('#uex-results')).toContainText('재고·수요 반영 21 SCU');
    await expect(page.locator('#uex-results .uex-summary-grid')).toContainText('139,440');
    await page.locator('#uex-refresh').click();
    await expect(page.locator('#uex-results .uex-summary-grid')).toContainText('139,419');
    expect(queries).toBe(2);
    await page.locator('#ledger-qty').fill('696');
    await expect(page.locator('#profit-selected-profit-detail')).toContainText('이론 수익');
});
