const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('기본 제품 서체', () => {
    test('히어로는 전용 웹폰트 없이 제품 기본 서체와 모노 태그라인을 사용한다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        await expect(page.locator('#home.hero h1')).not.toHaveCSS('font-family', /VOLT Orbit Display/);
        await expect(page.locator('#home.hero h1')).toHaveCSS('font-weight', '900');
        await expect(page.locator('.hero-tagline')).toHaveCSS('font-family', /ui-monospace/);
        await expect(page.locator('.hero-tagline')).not.toHaveCSS('font-family', /VOLT Orbit Display/);
    });

    test('문서는 제거된 전용 웹폰트를 미리 불러오지 않는다', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('link[href*="VOLT-Orbit-Display"]')).toHaveCount(0);
    });
});
