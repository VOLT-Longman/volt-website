const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 상세필터: 인게임 구매/렌탈 가능(Erkul market 레이어 보유) 함선만 표시.
test.describe('함선 상세필터: 인게임 구매/렌탈 가능', () => {
    test('토글 시 시장 없는 함선 제외, 있는 함선 유지', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
        const before = await page.locator('#ships-grid .ship-card').count();

        await page.locator('#ship-advanced-toggle').click();
        const marketOnly = page.locator('#ship-market-only');
        await expect(marketOnly).toBeVisible();
        await marketOnly.check();

        // market 레이어 로드 완료 후 필터가 반영되면 카드 수가 줄어든다.
        await expect.poll(() => page.locator('#ships-grid .ship-card').count(), { timeout: 10000 })
            .toBeLessThan(before);
        // 시장 있는 함선(100i)은 유지, 시장 없는 함선(Javelin)은 제외.
        await expect(page.locator('#ships-grid .ship-card', { hasText: 'Javelin' })).toHaveCount(0);
        await expect(page.locator('#ships-grid .ship-card', { hasText: '100i' })).toHaveCount(1);

        // 활성 필터 카운트 배지 표시.
        await expect(page.locator('#ship-filter-count')).toHaveText('1');
    });

    test('필터 초기화로 해제', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();
        const before = await page.locator('#ships-grid .ship-card').count();

        await page.locator('#ship-advanced-toggle').click();
        await page.locator('#ship-market-only').check();
        await expect.poll(() => page.locator('#ships-grid .ship-card').count(), { timeout: 10000 })
            .toBeLessThan(before);

        await page.locator('#ship-filter-reset').click();
        await expect(page.locator('#ship-market-only')).not.toBeChecked();
        await expect.poll(() => page.locator('#ships-grid .ship-card').count()).toBe(before);
    });
});
