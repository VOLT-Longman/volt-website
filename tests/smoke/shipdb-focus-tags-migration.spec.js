const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// ShipDB 재작성 2단계 — focus·tags 제거(D7, 마지막 필드). VOLT 편집 분류, 대체 분류 없음.
// OFF: focus 배지·태그 칩·태그 필터·비교 focus 행 존재(기준선).
// ON: 전부 제거. '미구현' 릴리스 게이트는 implemented로 대체(플래너 정합 유지).
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

    test('ON: focus 배지·태그 칩·태그 필터 제거, 태그 필터 숨김', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(219);
        expect(await page.locator('.ship-focus-badge').count()).toBe(0);
        expect(await page.locator('.ship-tag').count()).toBe(0);
        expect(await page.locator('#ship-tag-filters [data-ship-tag-filter]').count()).toBe(0);
        await expect(page.locator('#ship-tag-filters')).toBeHidden();
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
