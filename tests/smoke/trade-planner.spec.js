const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('무역플래너', () => {
    test('함선 선택 → 결과 패널 렌더 (UEX 모킹)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#trade-planner');

        await expect(page.locator('#trade-planner')).toHaveClass(/active/);

        const search = page.locator('#logistics-ship-search');
        await search.fill('Hull');
        const results = page.locator('#logistics-ship-results');
        await expect(results).toBeVisible();
        await results.locator('[role="option"]').first().click();

        await expect(page.locator('#logistics-ship-summary')).toBeVisible();
        await expect.poll(async () => (await page.locator('#logistics-result').innerText()).trim().length).toBeGreaterThan(0);
        await expect.poll(async () => await page.locator('#trade-briefing-text').inputValue()).not.toBe('');
    });
});
