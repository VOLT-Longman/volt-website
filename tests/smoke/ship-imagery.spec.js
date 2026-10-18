const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');
const pilot = require('../../data/ship-imagery.json').records;
// Failure injection must reach the network instead of the offline cache.
test.use({ serviceWorkers: 'block' });

for (const ship of pilot) {
    test(`공식 사진: ${ship.productName} 카드·상세·출처 일치`, async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.locator('#ship-search').fill(ship.productName);
        const card = page.locator(`[data-ship-id="${ship.id}"]`);
        const image = card.locator('[data-ship-image]');
        await expect(image).toHaveAttribute('src', ship.thumbnail.path);
        await expect(image).toHaveAttribute('loading', 'lazy');
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((img) => img.complete && img.naturalWidth === 640)).toBe(true);
        await card.locator('.ship-name-btn').click();
        const detail = page.locator('#global-modal .ship-photo-detail');
        await expect(detail.locator('img')).toHaveAttribute('src', ship.detail.path);
        await expect(detail.locator('a')).toHaveAttribute('href', ship.sourcePage);
        await expect.poll(() => detail.locator('img').evaluate((img) => img.complete && img.naturalWidth === 1280)).toBe(true);
        const photoBox = await detail.boundingBox();
        const statsBox = await page.locator('.ship-reader-overview').boundingBox();
        expect(statsBox.y).toBeGreaterThanOrEqual(photoBox.y + photoBox.height);
    });
}

test('파생형·미등록 함선에는 다른 모델 사진을 상속하지 않음', async ({ page }) => {
    await mockApi(page);
    await gotoSection(page, '#ships');
    expect(await page.evaluate(() => ['c2', 'c2-hercules-bis', 'a1-spirit', 'cutlass-red', 'freelancer-max', 'hull-b', '__proto__', 'constructor'].map((id) => window.VOLT_SHIP_IMAGERY.get(id)))).toEqual(Array(8).fill(null));
    await page.locator('#ship-search').fill('Freelancer MAX');
    const card = page.locator('[data-ship-id="freelancer-max"]');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-ship-image]')).toHaveCount(0);
    await card.locator('.ship-name-btn').click();
    await expect(page.locator('#global-modal .ship-photo')).toHaveCount(0);
    await expect(page.locator('#global-modal')).toContainText('SCU');
});

test('이미지 요청 실패 시 카드·상세 사양과 조작 유지', async ({ page }) => {
    await page.route('**/assets/images/ships/**', (route) => route.abort());
    await mockApi(page);
    await gotoSection(page, '#ships');
    await page.locator('#ship-search').fill('C2 Hercules');
    const card = page.locator('[data-ship-id="c2-hercules"]');
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.ship-photo')).toHaveCount(0);
    await card.locator('.ship-name-btn').click();
    await expect(page.locator('#global-modal .ship-photo')).toHaveCount(0);
    await expect(page.locator('#global-modal')).toContainText('696 SCU');
    await page.keyboard.press('Escape');
    await expect(page.locator('#global-modal')).not.toHaveClass(/active/);
});

test('사진 모듈 실패에도 함선 검색과 상세 사양 사용 가능', async ({ page }) => {
    await page.route('**/js/ship-imagery.js*', (route) => route.abort());
    await mockApi(page);
    await gotoSection(page, '#ships');
    await page.locator('#ship-search').fill('C2 Hercules');
    await page.locator('[data-ship-id="c2-hercules"] .ship-name-btn').click();
    await expect(page.locator('#global-modal')).toContainText('696 SCU');
});

test('모바일 영어 상세: 사진·출처 번역 및 가로 넘침 없음', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('volt-lang', 'en'));
    await mockApi(page);
    await gotoSection(page, '#ships');
    await page.locator('#ship-search').fill('C1 Spirit');
    await page.locator('[data-ship-id="c1-spirit"] .ship-name-btn').click();
    const photo = page.locator('#global-modal .ship-photo-detail');
    await expect(photo.locator('img')).toHaveAttribute('alt', 'C1 Spirit spacecraft');
    await expect(photo.locator('a')).toHaveText('Image source ↗');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await photo.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
});
