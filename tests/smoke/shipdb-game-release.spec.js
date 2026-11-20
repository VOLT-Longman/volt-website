const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

for (const [id, cls, name] of [['galaxy', 'rsi_galaxy', '갤럭시'], ['liberator', 'anvl_liberator', '리버레이터']]) {
    test(`게임 파일 DB: ${id}가 출시 필터에 남고 정확한 이미지로 로드아웃에 연결된다`, async ({ page }) => {
        await mockApi(page);
        await page.route('**/api/uex/loadout-prices**', route => route.fulfill({ json: { data: {}, byName: [] } }));
        await gotoSection(page, '#ships');
        await page.locator('#ship-search').fill(name);
        await page.locator('#ship-advanced-toggle').click();
        await page.locator('#ship-hide-unreleased').check();
        const card = page.locator(`[data-ship-id="${id}"]`);
        await expect(card).toBeVisible();
        await card.locator('.ship-name-btn').click();
        await expect(page.locator('.ship-live-summary .ship-live-heading .ship-live-meta')).toHaveText('가격: UEX');
        await page.locator('#global-modal [data-volt-open="loadout"]').click();
        await expect(page.locator('#loadout-ship-title')).toContainText(name);
        const photo = page.locator('.loadout-shiphead img.loadout-shipphoto');
        await expect(photo).toHaveAttribute('src', `/assets/images/ships/${id}-thumbnail.webp`);
        await expect.poll(() => photo.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
        await page.locator('[data-loadout-browse]').click();
        await expect(page.locator(`[data-loadout-ship="${cls}"]`)).toBeVisible();
    });
}

test('게임 파일 DB: Hyun 출시 미확인과 한국어 설명 미제공은 명시한다', async ({ page }) => {
    await mockApi(page);
    await gotoSection(page, '#ships');
    await page.locator('#ship-search').fill('Hyun');
    await expect(page.locator('[data-ship-id="hyun"]')).toContainText('출시 미확인');
    await page.locator('#ship-search').fill('Constellation Aquila');
    await expect(page.locator('[data-ship-id="constellation-aquila"]')).toContainText('한국어 패치에 설명이 없어');
});
