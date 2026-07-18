const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// ShipDB 재작성 2단계 — focus·tags 제거(D7). VOLT 편집 분류.
// OFF: focus 배지·태그 칩·태그(카테고리) 필터·비교 focus 행 존재(기준선).
// ON: focus 배지·태그 칩·VOLT 카테고리 필터 제거. 필터 컨테이너는 이후 role 이관에서
//     canonical role 칩으로 재활용된다(숨김 아님). '미구현' 게이트는 implemented로 대체.
test.describe('focus·tags 제거 (D7: OFF=존재, ON=제거)', () => {
    test('OFF 기본: focus 배지·태그 칩·태그 필터 존재', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        expect(await page.locator('.ship-focus-badge').count()).toBeGreaterThan(0);
        expect(await page.locator('.ship-tag').count()).toBeGreaterThan(0);
        expect(await page.locator('#ship-tag-filters [data-ship-tag-filter]').count()).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });

    test('ON: focus 배지·태그 칩·VOLT 카테고리 필터 제거(필터는 role 칩으로 대체)', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
        expect(await page.locator('.ship-focus-badge').count()).toBe(0);
        expect(await page.locator('.ship-tag').count()).toBe(0);
        // VOLT focus/tags 카테고리 칩(KO 키)은 제거된다
        expect(await page.locator('#ship-tag-filters [data-ship-tag-filter="화물"]').count()).toBe(0);
        expect(await page.locator('#ship-tag-filters [data-ship-tag-filter="전투"]').count()).toBe(0);
        // 필터 컨테이너는 숨겨지지 않고 canonical role 칩으로 대체된다(role 이관)
        await expect(page.locator('#ship-tag-filters')).toBeVisible();
        expect(await page.locator('#ship-tag-filters [data-ship-tag-filter]').count()).toBeGreaterThan(0);
    });

    test('ON: 비교표에 focus(분류) 행 없음, role 행은 유지', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
        for (const id of ['freelancer', 'caterpillar']) await page.locator(`[data-compare-ship-id="${id}"]`).click();
        await page.locator('#ship-compare-open').click();
        await page.waitForSelector('.ship-compare-table');
        expect(await page.locator('.ship-compare-table tr', { hasText: '분류' }).count()).toBe(0);
        expect(await page.locator('.ship-compare-table tr', { hasText: '역할' }).count()).toBeGreaterThan(0);
    });
});
