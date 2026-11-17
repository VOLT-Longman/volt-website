const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

test('첫 화면 항로 영상은 재생이 시작된 뒤에만 켜지고 글자를 가리지 않는다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await mockApi(page); await gotoSection(page, '');
    const film = page.locator('#hero-film');
    await expect(page.locator('#home')).toHaveClass(/hero-film-on/, { timeout: 15000 });
    await expect.poll(() => film.evaluate(video => !video.paused && video.currentTime > 0)).toBe(true);
    await expect(film).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('#home h1')).toBeVisible();
    await page.locator('.hero-action[href="#join"]').click();
    await expect(page.locator('#join')).toBeVisible();
    // 다른 화면으로 가면 영상은 멈춘다.
    await expect.poll(() => film.evaluate(video => video.paused)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});

test('움직임 줄이기 설정에서는 영상을 받지 않고 사진만 보인다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const requests = [];
    page.on('request', request => { if (request.url().includes('/assets/video/')) requests.push(request.url()); });
    await mockApi(page); await gotoSection(page, '');
    await page.waitForTimeout(1500);
    await expect(page.locator('#home')).not.toHaveClass(/hero-film-on/);
    await expect(page.locator('#hero-film')).toBeHidden();
    await expect(page.locator('.hero-cine-image')).toBeVisible();
    expect(requests).toEqual([]);
});

test('데이터 절약 모드에서는 영상을 받지 않는다', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } });
    });
    const requests = [];
    page.on('request', request => { if (request.url().includes('/assets/video/')) requests.push(request.url()); });
    await mockApi(page); await gotoSection(page, '');
    await page.waitForTimeout(1500);
    await expect(page.locator('#home')).not.toHaveClass(/hero-film-on/);
    expect(requests).toEqual([]);
});

test('영상 파일을 받지 못해도 원래 첫 화면이 그대로 보인다', async ({ page }) => {
    await page.route('**/assets/video/**', route => route.abort());
    await mockApi(page); await gotoSection(page, '');
    await page.waitForTimeout(1500);
    await expect(page.locator('#home')).not.toHaveClass(/hero-film-on/);
    await expect(page.locator('#home h1')).toBeVisible();
    await expect(page.locator('.hero-cine-image')).toBeVisible();
});
