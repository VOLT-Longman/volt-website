const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('VOLT Orbit Display', () => {
    test('실험용 전용 폰트는 라이브 히어로에 적용하지 않는다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        await expect(page.locator('#home.hero h1')).not.toHaveCSS('font-family', /VOLT Orbit Display/);
        await expect(page.locator('#home.hero .hero-proof dd').first()).not.toHaveCSS('font-family', /VOLT Orbit Display/);
    });

    test('전용 웹폰트 파일은 WOFF2로 제공된다', async ({ page }) => {
        const response = await page.request.get('/assets/fonts/VOLT-Orbit-Display.woff2');
        expect(response.ok()).toBe(true);
        expect(response.headers()['content-type']).toContain('font/woff2');
    });
});
