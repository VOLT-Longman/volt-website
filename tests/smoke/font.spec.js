const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('VOLT Orbit Display', () => {
    test('홈 핵심 지표와 영문 히어로에 전용 웹폰트를 적용한다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        const fontState = await page.locator('#home.hero .hero-proof dd').first().evaluate(async (element) => {
            await document.fonts.ready;
            return {
                family: getComputedStyle(element).fontFamily,
                loaded: document.fonts.check('700 48px "VOLT Orbit Display"', 'MOVE THE VERSE.'),
            };
        });
        expect(fontState.family).toContain('VOLT Orbit Display');
        expect(fontState.loaded).toBe(true);
        await expect(page.locator('#home.hero h1')).toHaveCSS('font-family', /VOLT Orbit Display/);
    });

    test('전용 웹폰트 파일은 WOFF2로 제공된다', async ({ page }) => {
        const response = await page.request.get('/assets/fonts/VOLT-Orbit-Display.woff2');
        expect(response.ok()).toBe(true);
        expect(response.headers()['content-type']).toContain('font/woff2');
    });
});
