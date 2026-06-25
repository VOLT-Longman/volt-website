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

    // Phase 2: picker도 한글 표시명 정책 적용 + 한글 검색/선택 후 계산 정상.
    test('함선 picker: 한글명 검색·선택 → 한글 표시 + 결과 렌더', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#trade-planner');

        const search = page.locator('#logistics-ship-search');
        await search.fill('어벤저 타이탄');
        const results = page.locator('#logistics-ship-results');
        await expect(results).toBeVisible();
        const option = results.locator('[role="option"]').first();
        await expect(option.locator('strong')).toHaveText(/어벤저 타이탄/);

        await option.click();
        const summary = page.locator('#logistics-ship-summary');
        await expect(summary).toBeVisible();
        await expect(summary).toContainText('어벤저 타이탄');
        await expect.poll(async () => (await page.locator('#logistics-result').innerText()).trim().length).toBeGreaterThan(0);
    });

    test('UEX 상품 검색: 12개 초과 결과도 잘리지 않고 모두 표시(스크롤)', async ({ page }) => {
        await mockApi(page);
        const data = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Mineral${i + 1}`, code: `M${i + 1}`, category_name: 'Metal', is_visible: 1, is_available_live: 1 }));
        await page.route(/\/api\/uex\/commodities$/, (route) => route.fulfill({ json: { status: 'ok', data } }));
        await gotoSection(page, '#trade-planner');

        await expect(page.locator('#uex-status')).toHaveText(/상품 20종/);
        const search = page.locator('#uex-commodity-search');
        await search.click();
        await search.fill('Mineral');
        const options = page.locator('#uex-commodity-results [data-commodity-id]');
        await expect.poll(() => options.count()).toBe(20);
    });

    test('UEX 거래 위치 필터: 전체 / 스테이션·도시 / 지상기지 분리', async ({ page }) => {
        await mockApi(page);
        await page.route(/\/api\/uex\/commodities$/, (route) => route.fulfill({
            json: { status: 'ok', data: [{ id: 1, name: 'Gold', code: 'G', category_name: 'Metal', is_visible: 1, is_available_live: 1 }] },
        }));
        await page.route(/\/api\/uex\/commodities\/1\/prices$/, (route) => route.fulfill({
            json: { status: 'ok', data: [
                { terminal_name: 'Station A', space_station_name: 'Station A', price_buy: 100, price_sell: 120, date_modified: 1700000000 },
                { terminal_name: 'City B', city_name: 'Lorville', price_buy: 90, price_sell: 130, date_modified: 1700000000 },
                { terminal_name: 'Outpost C', outpost_name: 'Outpost C', price_buy: 80, price_sell: 140, date_modified: 1700000000 },
                { terminal_name: 'Unknown D', price_buy: 70, price_sell: 150, date_modified: 1700000000 },
            ] },
        }));
        await gotoSection(page, '#trade-planner');
        await expect(page.locator('#uex-status')).toHaveText(/상품 1종/);

        const search = page.locator('#uex-commodity-search');
        await search.click();
        await search.fill('Gold');
        await page.locator('#uex-commodity-results [data-commodity-id="1"]').click();
        await page.locator('#uex-refresh').click();

        const results = page.locator('#uex-results');
        // 전체: 4개 타입 배지 모두 노출
        await expect(results.getByText('스테이션', { exact: true }).first()).toBeVisible();
        await expect(results.getByText('도시', { exact: true }).first()).toBeVisible();
        await expect(results.getByText('지상기지', { exact: true }).first()).toBeVisible();
        await expect(results.getByText('미분류', { exact: true }).first()).toBeVisible();

        // 스테이션/도시 필터: 지상기지·미분류 제외
        await page.locator('[data-uex-loc="auto"]').click();
        await expect(results.getByText('스테이션', { exact: true }).first()).toBeVisible();
        await expect(results.getByText('도시', { exact: true }).first()).toBeVisible();
        await expect(results.getByText('지상기지', { exact: true })).toHaveCount(0);
        await expect(results.getByText('미분류', { exact: true })).toHaveCount(0);

        // 지상기지 필터: 지상기지만
        await page.locator('[data-uex-loc="ground"]').click();
        await expect(results.getByText('지상기지', { exact: true }).first()).toBeVisible();
        await expect(results.getByText('스테이션', { exact: true })).toHaveCount(0);
        await expect(results.getByText('도시', { exact: true })).toHaveCount(0);
        await expect(results.getByText('미분류', { exact: true })).toHaveCount(0);
    });
});
