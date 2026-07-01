const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('무역플래너', () => {
    test('함선 선택 → 요약 카드 표시 (재설계: 결과/브리핑 제거)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#trade-planner');

        await expect(page.locator('#trade-planner')).toHaveClass(/active/);

        const search = page.locator('#logistics-ship-search');
        await search.fill('Hull');
        const results = page.locator('#logistics-ship-results');
        await expect(results).toBeVisible();
        await results.locator('[role="option"]').first().click();

        await expect(page.locator('#logistics-ship-summary')).toBeVisible();
        // 재설계로 제거된 요소는 더 이상 없어야 한다.
        await expect(page.locator('#logistics-result')).toHaveCount(0);
        await expect(page.locator('#trade-briefing-text')).toHaveCount(0);
        await expect(page.locator('#trade-operation-type')).toHaveCount(0);
        await expect(page.locator('#trade-preset-grid')).toHaveCount(0);
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

    test('추천 무역품: 위치 필터 연동 (전체/스테이션·도시/지상기지)', async ({ page }) => {
        await mockApi(page);
        await page.route(/\/api\/uex\/commodities$/, (route) => route.fulfill({ json: { status: 'ok', data: [
            { id: 1, name: 'Gold', code: 'G', category_name: 'Metal', is_visible: 1, is_available_live: 1 },
            { id: 2, name: 'Beryl', code: 'B', category_name: 'Metal', is_visible: 1, is_available_live: 1 },
        ] } }));
        // Gold: 스테이션 매수 + 스테이션 매도 (auto 그룹)
        await page.route(/\/api\/uex\/commodities\/1\/prices$/, (route) => route.fulfill({ json: { status: 'ok', data: [
            { terminal_name: 'CRU-L1', space_station_name: 'CRU-L1', price_buy: 100, price_sell: 0, date_modified: 1700000000, scu_buy: 5000 },
            { terminal_name: 'ARC-L1', space_station_name: 'ARC-L1', price_buy: 0, price_sell: 150, date_modified: 1700000000, scu_sell: 8000 },
        ] } }));
        // Beryl: 지상기지 매수 + 지상기지 매도
        await page.route(/\/api\/uex\/commodities\/2\/prices$/, (route) => route.fulfill({ json: { status: 'ok', data: [
            { terminal_name: 'Shubin', outpost_name: 'Shubin', price_buy: 80, price_sell: 0, date_modified: 1700000000, scu_buy: 1000 },
            { terminal_name: 'Rayari', outpost_name: 'Rayari', price_buy: 0, price_sell: 140, date_modified: 1700000000, scu_sell: 900 },
        ] } }));
        await gotoSection(page, '#trade-planner');
        await expect(page.locator('#uex-status')).toHaveText(/상품 2종/);
        await page.locator('.uex-recommend-panel').evaluate((d) => { d.open = true; });
        const recResults = page.locator('#uex-recommend-results');
        const recBtn = page.locator('#uex-recommend-refresh');
        const recStatus = page.locator('#uex-recommend-status');

        // 전체: Gold + Beryl 모두 추천
        await recBtn.click();
        await expect(recResults).toContainText('Gold');
        await expect(recResults).toContainText('Beryl');
        await expect(recStatus).toHaveText(/전체 거래 후보/);

        // 스테이션/도시: Gold만 (지상 전용 Beryl 제외)
        await page.locator('[data-uex-loc="auto"]').click();
        await recBtn.click();
        await expect(recResults).toContainText('Gold');
        await expect(recResults).not.toContainText('Beryl');
        await expect(recStatus).toHaveText(/스테이션\/도시 거래 후보/);

        // 지상기지: Beryl만 (스테이션 전용 Gold 제외)
        await page.locator('[data-uex-loc="ground"]').click();
        await recBtn.click();
        await expect(recResults).toContainText('Beryl');
        await expect(recResults).not.toContainText('Gold');
        await expect(recStatus).toHaveText(/지상기지 거래 후보/);
    });

    test('UEX 항성계 필터: 복수 선택으로 거점 좁히기 + 칩 동적 노출', async ({ page }) => {
        await mockApi(page);
        await page.route(/\/api\/uex\/commodities$/, (route) => route.fulfill({
            json: { status: 'ok', data: [{ id: 1, name: 'Gold', code: 'G', category_name: 'Metal', is_visible: 1, is_available_live: 1 }] },
        }));
        await page.route(/\/api\/uex\/commodities\/1\/prices$/, (route) => route.fulfill({
            json: { status: 'ok', data: [
                { terminal_name: 'StantonBuy', space_station_name: 'CRU-L1', star_system_name: 'Stanton', price_buy: 100, price_sell: 0, date_modified: 1700000000, scu_buy: 5000 },
                { terminal_name: 'StantonSell', space_station_name: 'ARC-L1', star_system_name: 'Stanton', price_buy: 0, price_sell: 150, date_modified: 1700000000, scu_sell: 4000 },
                { terminal_name: 'PyroBuy', space_station_name: 'Terminus', star_system_name: 'Pyro', price_buy: 90, price_sell: 0, date_modified: 1700000000, scu_buy: 3000 },
                { terminal_name: 'PyroSell', space_station_name: 'Checkmate', star_system_name: 'Pyro', price_buy: 0, price_sell: 160, date_modified: 1700000000, scu_sell: 2000 },
            ] },
        }));
        await gotoSection(page, '#trade-planner');
        await expect(page.locator('#uex-status')).toHaveText(/상품 1종/);

        // 조회 전에는 항성계 필터 행이 숨겨져 있어야 한다(빈 라벨 노출 방지).
        await expect(page.locator('#uex-system-filter')).toBeHidden();

        const search = page.locator('#uex-commodity-search');
        await search.click();
        await search.fill('Gold');
        await page.locator('#uex-commodity-results [data-commodity-id="1"]').click();
        await page.locator('#uex-refresh').click();

        // 항성계 칩이 데이터 기반으로 노출(전체/Pyro/Stanton)
        await expect(page.locator('#uex-system-filter')).toBeVisible();
        await expect(page.locator('#uex-system-chips [data-uex-system="Stanton"]')).toBeVisible();
        await expect(page.locator('#uex-system-chips [data-uex-system="Pyro"]')).toBeVisible();

        const results = page.locator('#uex-results');
        // 전체: 양쪽 항성계 모두
        await expect(results).toContainText('StantonBuy');
        await expect(results).toContainText('PyroBuy');

        // Stanton만: Pyro 거점 제외
        await page.locator('#uex-system-chips [data-uex-system="Stanton"]').click();
        await expect(results).toContainText('StantonBuy');
        await expect(results).toContainText('StantonSell');
        await expect(results).not.toContainText('PyroBuy');
        await expect(results).not.toContainText('PyroSell');

        // 복수 선택: Pyro 추가 → 둘 다
        await page.locator('#uex-system-chips [data-uex-system="Pyro"]').click();
        await expect(results).toContainText('StantonBuy');
        await expect(results).toContainText('PyroBuy');

        // 전체로 초기화
        await page.locator('#uex-system-chips [data-uex-system=""]').click();
        await expect(page.locator('#uex-system-chips [data-uex-system=""]')).toHaveClass(/uex-loc-active/);
        await expect(results).toContainText('PyroSell');
    });

    test('UEX 후보 선택 시 배지 묶음(.uex-candidate-tags)로 그룹화 — 레이아웃 튐 방지', async ({ page }) => {
        await mockApi(page);
        await page.route(/\/api\/uex\/commodities$/, (route) => route.fulfill({
            json: { status: 'ok', data: [{ id: 1, name: 'Gold', code: 'G', category_name: 'Metal', is_visible: 1, is_available_live: 1 }] },
        }));
        await page.route(/\/api\/uex\/commodities\/1\/prices$/, (route) => route.fulfill({
            json: { status: 'ok', data: [
                { terminal_name: 'Port A', space_station_name: 'CRU-L1', star_system_name: 'Stanton', price_buy: 100, price_sell: 0, date_modified: 1700000000 },
                { terminal_name: 'Port B', space_station_name: 'ARC-L1', star_system_name: 'Stanton', price_buy: 0, price_sell: 180, date_modified: 1700000000 },
            ] },
        }));
        await gotoSection(page, '#trade-planner');
        const search = page.locator('#uex-commodity-search');
        await search.click();
        await search.fill('Gold');
        await page.locator('#uex-commodity-results [data-commodity-id="1"]').click();
        await page.locator('#uex-refresh').click();

        // 매수 후보 1번 선택 → 같은 카드의 배지 묶음 안에 위치 배지 + '선택됨'이 함께 존재
        await page.locator('#uex-results [data-uex-side="buy"]').first().click();
        const selectedCard = page.locator('#uex-results .uex-candidate-card.is-selected').first();
        await expect(selectedCard.locator('.uex-candidate-tags .uex-loc-badge')).toBeVisible();
        await expect(selectedCard.locator('.uex-candidate-tags .uex-candidate-selected')).toHaveText('선택됨');
    });

    test('추천 무역품: 필터 조건에 후보 없으면 빈 상태(조용한 fallback 없음)', async ({ page }) => {
        await mockApi(page);
        await page.route(/\/api\/uex\/commodities$/, (route) => route.fulfill({ json: { status: 'ok', data: [
            { id: 1, name: 'Gold', code: 'G', category_name: 'Metal', is_visible: 1, is_available_live: 1 },
        ] } }));
        // Gold는 스테이션 전용 → 지상기지 필터에선 추천 0
        await page.route(/\/api\/uex\/commodities\/1\/prices$/, (route) => route.fulfill({ json: { status: 'ok', data: [
            { terminal_name: 'CRU-L1', space_station_name: 'CRU-L1', price_buy: 100, price_sell: 0, date_modified: 1700000000, scu_buy: 5000 },
            { terminal_name: 'ARC-L1', space_station_name: 'ARC-L1', price_buy: 0, price_sell: 150, date_modified: 1700000000, scu_sell: 8000 },
        ] } }));
        await gotoSection(page, '#trade-planner');
        await expect(page.locator('#uex-status')).toHaveText(/상품 1종/);
        await page.locator('.uex-recommend-panel').evaluate((d) => { d.open = true; });

        await page.locator('[data-uex-loc="ground"]').click();
        await page.locator('#uex-recommend-refresh').click();
        await expect(page.locator('#uex-recommend-results')).toContainText('추천 가능한 무역품이 없습니다');
        await expect(page.locator('#uex-recommend-results')).not.toContainText('Gold');
    });
});
