const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 위생 패치 P1: 초기화에서 CMS·canonical 완료 콜백이 각각 전체 재렌더를 돌던 중복을 제거한다.
// 계약은 "앱 최초 초기화 구간의 전체 재렌더 1회". 사용자 상호작용 이후의 의도된 렌더는 대상이 아니다.
const fullRefreshCount = (page) => page.evaluate(() => window.__VOLT_FULL_REFRESH_COUNT__ ?? 0);

test.describe('초기 로드 렌더 예산 (P1)', () => {
    test('초기화 구간의 전체 재렌더는 1회', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        // canonical 로드가 끝나 249척이 보이는 시점 = 초기화 경로가 모두 정착한 뒤
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        await expect.poll(async () => fullRefreshCount(page)).toBe(1);
    });

    test('CMS 실패해도 초기화가 멈추지 않고 함선·랜딩이 렌더된다', async ({ page }) => {
        await mockApi(page);
        // CMS 계열 응답만 실패시킨다(canonical 정적 JSON은 그대로).
        for (const route of ['**/api/ship-overrides', '**/api/notices', '**/api/events', '**/api/gallery']) {
            await page.route(route, (r) => r.fulfill({ status: 500, body: 'fail' }));
        }
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        expect(await fullRefreshCount(page)).toBe(1);
    });

    test('canonical 실패해도 나머지 화면이 사라지지 않는다', async ({ page }) => {
        await mockApi(page);
        await page.route('**/data/canonical/**', (r) => r.fulfill({ status: 500, body: 'fail' }));
        await gotoSection(page, '#notices');
        // 공지 섹션은 canonical과 무관하게 렌더되어야 한다
        await expect(page.locator('#notices .notice-card, #notices .notice-item').first()).toBeVisible();
        await expect.poll(async () => fullRefreshCount(page)).toBe(1);
    });

    test('초기 로드 뒤 전역 검색·무역플래너·마이페이지가 함선을 인식한다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        // 전역 검색
        await page.locator('#search-toggle').click();
        await page.locator('#global-search-input').fill('Freelancer');
        await expect(page.locator('#search-results')).toContainText(/Freelancer|프리랜서/);
        await page.keyboard.press('Escape');
        // 무역플래너 함선 picker — 공개 목록에서 검색되어야 한다
        await gotoSection(page, '#trade-planner');
        await page.locator('#logistics-ship-search').fill('Freelancer');
        const results = page.locator('#logistics-ship-results');
        await expect(results).toBeVisible();
        await expect(results.locator('[role="option"]').first()).toContainText(/Freelancer|프리랜서/);
    });
});
