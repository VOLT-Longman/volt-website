const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 커밋 C: data/ship-en.js 제거. EN 표시는 canonical·presentation·localization이 직접 제공한다.
// 언어를 전환해도 ship-en.js 요청이 발생하지 않아야 하고, KO/EN 모두 이름·설명·역할이 정상이어야 한다.
function trackShipEnRequests(page) {
    const hits = [];
    page.on('request', (request) => { if (request.url().includes('ship-en')) hits.push(request.url()); });
    return hits;
}

test.describe('ship-en 제거 (커밋 C)', () => {
    test('KO: 카드 이름·설명·역할 표시 + ship-en 요청 0', async ({ page }) => {
        const hits = trackShipEnRequests(page);
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        const card = page.locator('[data-ship-id="freelancer"]');
        await expect(card.locator('.ship-name')).toContainText(/프리랜서|Freelancer/);
        await expect(card.locator('.ship-desc')).not.toHaveText('');
        await expect(card.locator('.ship-card-role-detail')).toHaveText('경 화물선');
        expect(hits).toEqual([]);
    });

    test('EN 전환: 이름·역할 영문 표시 + ship-en 요청 0', async ({ page }) => {
        const hits = trackShipEnRequests(page);
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        const card = page.locator('[data-ship-id="freelancer"]');
        await expect(card.locator('.ship-name')).toContainText('Freelancer');
        await expect(card.locator('.ship-card-role-detail')).toHaveText('Light Freight');
        await expect(card.locator('.ship-desc')).not.toHaveText('');
        expect(hits).toEqual([]);
    });

    test('EN 상세·검색·비교: canonical 값으로 동작', async ({ browser }) => {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        const hits = trackShipEnRequests(page);
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        // 검색(영문명)
        await page.locator('#ship-search').fill('Freelancer');
        const card = page.locator('#ships-grid .ship-card').first();
        await expect(card.locator('.ship-name')).toContainText('Freelancer');
        // 상세 모달
        await card.locator('.ship-name-btn').click();
        const modal = page.locator('#global-modal');
        await expect(modal).toHaveClass(/active/);
        await expect(modal.locator('.ship-modal-stat span').first()).toHaveText('Role');
        await page.keyboard.press('Escape');
        // 비교
        await page.locator('#ship-search').fill('');
        for (const id of ['freelancer', 'caterpillar']) await page.locator(`[data-compare-ship-id="${id}"]`).click();
        await page.locator('#ship-compare-open').click();
        await expect(page.locator('.ship-compare-table')).toBeVisible();
        expect(hits).toEqual([]);
        await ctx.close();
    });
});
