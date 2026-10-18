const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');
const excluded = require('../../data/ship-imagery-review.json').records.filter(row => row.status === 'excluded');

test('영구 제외 8종: CMS 표시 요청에도 검색·공개 ID·플래너 목록에 복원되지 않는다', async ({ page }) => {
    await mockApi(page);
    await page.route('**/api/ship-overrides', route => route.fulfill({ json: { items: excluded.map(row => ({ shipId: row.id, hidden: false, name: row.catalogName })) } }));
    await gotoSection(page, '#ships');
    await expect(page.locator('#ships-grid .ship-card')).toHaveCount(246);
    const state = await page.evaluate(ids => ({
        publicIds: window.VOLT_SHIPDB_CANONICAL.publicShips().map(ship => ship.id),
        removed: ids.map(id => window.VOLT_SHIPDB_CANONICAL.getShip(id)),
    }), excluded.map(row => row.id));
    expect(state.removed).toEqual(Array(8).fill(null));
    for (const row of excluded) {
        expect(state.publicIds).not.toContain(row.id);
        await page.locator('#ship-search').fill(row.catalogName);
        await expect(page.locator(`#ships-grid [data-ship-id="${row.id}"]`)).toHaveCount(0);
    }
    await gotoSection(page, '#trade-planner');
    for (const row of excluded) {
        await page.locator('#logistics-ship-search').fill(row.catalogName);
        await expect(page.locator('#logistics-ship-results [role="option"]')).toHaveCount(0);
    }
    await page.locator('#logistics-ship-search').fill('C2 Hercules');
    await expect(page.locator('#logistics-ship-results [role="option"]').first()).toBeVisible();
});
