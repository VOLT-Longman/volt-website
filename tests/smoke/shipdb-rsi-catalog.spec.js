const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

test.describe('RSI 공식 함선 통합 목록', () => {
    test('OFF 강제: RSI 공식 상태 배지와 별도 카탈로그는 노출하지 않는다', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = false; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        expect(await page.locator('.ship-rsi-status').count()).toBe(0);
        expect(await page.locator('[data-catalog-chip], #rsi-catalog-grid').count()).toBe(0);
        expect(errors).toEqual([]);
    });

    test('ON: RSI 공식 30척이 메인 목록에 포함되고 별도 탭은 없다', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        expect(await page.locator('[data-catalog-chip], #rsi-catalog-grid').count()).toBe(0);
        expect(await page.locator('#ships-grid [data-rsi-status="concept"]').count()).toBe(28);
        expect(await page.locator('#ships-grid [data-rsi-status="flight-ready"]').count()).toBe(2);
    });

    test('ON: 컨셉은 미구현 제외에 숨고 출시 상태 RSI 함선은 남는다', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect(page.locator('#ships-grid [data-ship-id="arrastra"]')).toHaveCount(1);
        await expect(page.locator('#ships-grid [data-ship-id="atls"]')).toHaveCount(1);
        await page.locator('#ship-advanced-toggle').click();
        await page.locator('#ship-hide-unreleased').check();
        await expect(page.locator('#ships-grid [data-ship-id="arrastra"]')).toHaveCount(0);
        await expect(page.locator('#ships-grid [data-ship-id="atls"]')).toHaveCount(1);
    });

    test('ON: RSI 공식 레코드는 레거시 설명·플래너 진입 없이 공식 값만 표시한다', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        const expanse = page.locator('#ships-grid [data-ship-id="expanse"]');
        await expect(expanse).toContainText(/RSI 공식 미제공/);
        expect(await expanse.locator('[data-use-planner-ship-id]').count()).toBe(0);
        const atls = page.locator('#ships-grid [data-ship-id="atls"]');
        expect(await atls.locator('[data-use-planner-ship-id]').count()).toBe(0);
        await atls.locator('[data-open-ship-id="atls"]').click();
        const officialUrl = await page.locator('.ship-modal-link[href*="robertsspaceindustries.com"]').getAttribute('href');
        expect(officialUrl).toContain('robertsspaceindustries.com');
    });
});
