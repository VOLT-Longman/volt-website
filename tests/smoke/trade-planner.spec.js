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

    // UEX 라이브 패널: main.js 분리(uex/trade-planner) 시 회귀 가드.
    test('UEX 패널: 상품 로드 → 선택 → 거래 후보 렌더', async ({ page }) => {
        await mockApi(page);
        // mockApi의 포괄 라우트보다 나중에 등록해 우선 적용한다.
        await page.route(/\/api\/uex\/commodities$/, (route) => route.fulfill({
            json: { status: 'ok', data: [{ id: 1, name: 'Gold', code: 'GOLD', category_name: 'Metal', is_visible: 1, is_available_live: 1 }] },
        }));
        await page.route(/\/api\/uex\/commodities\/1\/prices$/, (route) => route.fulfill({
            json: { status: 'ok', data: [
                { terminal_name: 'Port A', price_buy: 100, price_sell: 0, date_modified: 1700000000 },
                { terminal_name: 'Port B', price_buy: 0, price_sell: 180, date_modified: 1700000000 },
            ] },
        }));
        await gotoSection(page, '#trade-planner');

        await expect(page.locator('#uex-status')).toHaveText(/상품 1종/);

        const search = page.locator('#uex-commodity-search');
        await search.click();
        await search.fill('Gold');
        await page.locator('#uex-commodity-results [data-commodity-id="1"]').click();

        await page.locator('#uex-refresh').click();
        await expect(page.locator('#uex-results')).toContainText('매수 후보');
        await expect(page.locator('#uex-results')).toContainText('매도 후보');
    });

    test('UEX 패널: API 실패 시 멈춤 대신 안내 노출', async ({ page }) => {
        await mockApi(page);
        await page.route(/\/api\/uex\/commodities$/, (route) => route.fulfill({ status: 503, json: { error: 'fail' } }));
        await gotoSection(page, '#trade-planner');

        await expect(page.locator('#uex-status')).toHaveText(/UEX API 연결이 불안정합니다/);
    });
});
